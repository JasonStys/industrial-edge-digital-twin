/**
 * @file test_main.cpp
 * @brief Dependency-free unit, property, protocol, and fault-campaign tests.
 * @details Test functions and line locations are generated in docs/generated/symbol-index.md.
 */

#include "edge_twin/controller.hpp"
#include "edge_twin/engine.hpp"
#include "edge_twin/process_model.hpp"
#include "edge_twin/protocol.hpp"

#include <cmath>
#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

class TestFailure final : public std::runtime_error {
  public:
    using std::runtime_error::runtime_error;
};

/** Fail a test with a readable message when a predicate is false. */
void check(const bool condition, const std::string& message) {
    if (!condition) {
        throw TestFailure(message);
    }
}

/** Compare floating-point values using an explicit absolute tolerance. */
void check_near(const double actual, const double expected, const double tolerance,
                const std::string& message) {
    check(std::abs(actual - expected) <= tolerance, message);
}

void process_model_conserves_and_bounds_level() {
    edge_twin::ProcessModel process;
    process.reset({500.0, 21.0, 0.0});
    const edge_twin::ActuatorState actual = process.step(1.0, {100.0, 0.0, 0.0}, {});
    check_near(process.state().level_l, 512.0, 1e-9, "full pump should add 12 L in one second");
    check_near(actual.pump_pct, 100.0, 1e-9, "actual pump should match request without fault");

    for (int index = 0; index < 2000; ++index) {
        const double pump = static_cast<double>((index * 17) % 140) - 20.0;
        const double outlet = static_cast<double>((index * 31) % 140) - 20.0;
        static_cast<void>(process.step(0.05, {pump, outlet, 50.0}, {}));
        check(process.state().level_l >= 0.0 && process.state().level_l <= 1000.0,
              "level must remain within tank capacity");
        check(std::isfinite(process.state().temperature_c), "temperature must remain finite");
    }
}

void process_model_rejects_invalid_step() {
    edge_twin::ProcessModel process;
    bool threw = false;
    try {
        static_cast<void>(process.step(0.0, {}, {}));
    } catch (const std::invalid_argument&) {
        threw = true;
    }
    check(threw, "zero-duration step must be rejected");
}

void process_faults_override_actual_actuators() {
    edge_twin::ProcessModel process;
    edge_twin::FaultState faults;
    faults.pump_stuck_on = true;
    faults.heater_stuck_on = true;
    const auto actual = process.step(0.1, {}, faults);
    check_near(actual.pump_pct, 100.0, 1e-9, "stuck pump should report full actual output");
    check_near(actual.heater_pct, 100.0, 1e-9, "stuck heater should report full actual output");
}

void controller_applies_heater_interlock_in_manual_mode() {
    edge_twin::Controller controller;
    controller.set_mode(edge_twin::ControllerMode::manual);
    controller.set_manual_outputs({0.0, 0.0, 80.0});
    const auto output = controller.update({100.0, 0.0, edge_twin::SignalQuality::good},
                                          {20.0, 0.0, edge_twin::SignalQuality::good});
    check_near(output.heater_pct, 0.0, 1e-9, "heater must be disabled below permissive level");
    check(controller.alarms().heater_interlock, "interlock alarm must explain the override");
}

void controller_rejects_bad_measurements_to_safe_state() {
    edge_twin::Controller controller;
    controller.set_mode(edge_twin::ControllerMode::automatic);
    const auto output = controller.update({500.0, 0.0, edge_twin::SignalQuality::stale},
                                          {20.0, 0.0, edge_twin::SignalQuality::good});
    check(controller.state() == edge_twin::ControllerState::faulted,
          "stale level must fault the controller");
    check_near(output.pump_pct + output.outlet_valve_pct + output.heater_pct, 0.0, 1e-9,
               "safe state must de-energize all requested outputs");
}

void controller_stops_fill_at_high_limit() {
    edge_twin::Controller controller;
    controller.set_mode(edge_twin::ControllerMode::manual);
    controller.set_manual_outputs({100.0, 0.0, 0.0});
    const auto output = controller.update({960.0, 0.0, edge_twin::SignalQuality::good},
                                          {20.0, 0.0, edge_twin::SignalQuality::good});
    check_near(output.pump_pct, 0.0, 1e-9, "high-level interlock must stop the pump");
    check(controller.alarms().high_level, "high-level alarm should be active");
}

void engine_commands_are_idempotent() {
    edge_twin::Engine engine;
    const auto first = engine.apply_command("mode_1", "set-mode", {"automatic"});
    const auto second = engine.apply_command("mode_1", "set-mode", {"manual"});
    check(first.accepted && !first.duplicate, "first command should be accepted once");
    check(second.accepted && second.duplicate, "reused command ID should return cached result");
    check(engine.snapshot().mode == edge_twin::ControllerMode::automatic,
          "duplicate command must not apply different arguments");
}

void engine_validates_command_boundaries() {
    edge_twin::Engine engine;
    check(!engine.apply_command("bad id", "set-mode", {"automatic"}).accepted,
          "unsafe command ID must be rejected");
    check(!engine.apply_command("target_1", "set-target", {"level_l", "9999"}).accepted,
          "out-of-range target must be rejected");
    check(!engine.apply_command("output_1", "set-output", {"pump_pct", "50"}).accepted,
          "manual output must be rejected outside manual mode");
    check(!engine.apply_command("unknown_1", "erase-world", {}).accepted,
          "unknown operation must be rejected");
}

void frozen_sensor_becomes_stale_and_faults_controller() {
    edge_twin::Engine engine;
    check(engine.apply_command("mode_auto", "set-mode", {"automatic"}).accepted,
          "automatic mode should be accepted");
    check(engine.apply_command("freeze_on", "inject-fault", {"freeze_level_sensor", "on"}).accepted,
          "sensor freeze should be accepted");
    edge_twin::Snapshot snapshot;
    for (int index = 0; index < 20; ++index) {
        snapshot = engine.tick(0.1);
    }
    check(snapshot.level.quality == edge_twin::SignalQuality::stale,
          "frozen signal should become stale after freshness deadline");
    check(snapshot.controller_state == edge_twin::ControllerState::faulted,
          "stale control input should fault the controller");
    check(snapshot.alarms.safe_state_active, "faulted controller should expose safe-state alarm");
}

void out_of_range_sensor_faults_immediately() {
    edge_twin::Engine engine;
    static_cast<void>(engine.apply_command("auto", "set-mode", {"automatic"}));
    static_cast<void>(
        engine.apply_command("oor", "inject-fault", {"level_sensor_out_of_range", "on"}));
    const auto snapshot = engine.tick(0.1);
    check(snapshot.level.quality == edge_twin::SignalQuality::out_of_range,
          "out-of-range fault should mark quality");
    check(snapshot.controller_state == edge_twin::ControllerState::faulted,
          "out-of-range signal should fault controller");
}

void clear_faults_restores_good_quality() {
    edge_twin::Engine engine;
    static_cast<void>(
        engine.apply_command("oor_on", "inject-fault", {"level_sensor_out_of_range", "on"}));
    check(engine.apply_command("clear", "clear-faults", {}).accepted,
          "clear-faults should be accepted");
    check(engine.tick(0.1).level.quality == edge_twin::SignalQuality::good,
          "cleared sensor should return to good quality");
}

void engine_runs_deterministically() {
    edge_twin::Engine left;
    edge_twin::Engine right;
    static_cast<void>(left.apply_command("auto", "set-mode", {"automatic"}));
    static_cast<void>(right.apply_command("auto", "set-mode", {"automatic"}));
    for (int index = 0; index < 1000; ++index) {
        const auto lhs = left.tick(0.1);
        const auto rhs = right.tick(0.1);
        check_near(lhs.plant.level_l, rhs.plant.level_l, 0.0, "identical runs must match exactly");
        check_near(lhs.plant.temperature_c, rhs.plant.temperature_c, 0.0,
                   "identical temperatures must match exactly");
    }
}

void protocol_enforces_input_bounds() {
    edge_twin::ProtocolCommand command;
    std::string error;
    check(edge_twin::parse_protocol_line("COMMAND abc set-mode automatic", command, error),
          "valid line should parse");
    check(command.verb == "COMMAND" && command.arguments.size() == 3U,
          "parsed command should preserve tokens");
    check(!edge_twin::parse_protocol_line(std::string(513U, 'a'), command, error),
          "oversized line must be rejected");
    check(!edge_twin::parse_protocol_line("COMMAND abc\nquit", command, error),
          "control characters must be rejected");
}

void json_output_escapes_untrusted_text() {
    check(edge_twin::json_escape("quote\" slash\\ newline\n") == "quote\\\" slash\\\\ newline\\n",
          "JSON escape should encode quotes, slashes, and controls");
    const auto error = edge_twin::protocol_error_json("bad\"code", "line\nmessage");
    check(error.find("bad\\\"code") != std::string::npos, "protocol errors must escape the code");
    check(error.find("line\\nmessage") != std::string::npos,
          "protocol errors must escape the message");
}

void serialization_contains_quality_and_units() {
    edge_twin::Engine engine;
    const std::string json = edge_twin::snapshot_json(engine.snapshot());
    check(json.find("\"level_l\"") != std::string::npos, "snapshot should expose level with units");
    check(json.find("\"quality\":\"good\"") != std::string::npos,
          "snapshot should expose signal quality");
    check(json.find("\"source_time_s\"") != std::string::npos,
          "snapshot should expose source timestamp with units");
}

using TestCase = std::pair<std::string, std::function<void()>>;

} // namespace

int main() {
    const std::vector<TestCase> tests{
        {"process model conserves and bounds level", process_model_conserves_and_bounds_level},
        {"process model rejects invalid step", process_model_rejects_invalid_step},
        {"process faults override actual actuators", process_faults_override_actual_actuators},
        {"manual heater interlock", controller_applies_heater_interlock_in_manual_mode},
        {"bad measurements activate safe state", controller_rejects_bad_measurements_to_safe_state},
        {"high limit stops fill", controller_stops_fill_at_high_limit},
        {"commands are idempotent", engine_commands_are_idempotent},
        {"command boundaries are validated", engine_validates_command_boundaries},
        {"frozen sensor becomes stale", frozen_sensor_becomes_stale_and_faults_controller},
        {"out-of-range sensor faults", out_of_range_sensor_faults_immediately},
        {"clear faults restores quality", clear_faults_restores_good_quality},
        {"engine is deterministic", engine_runs_deterministically},
        {"protocol bounds", protocol_enforces_input_bounds},
        {"JSON escaping", json_output_escapes_untrusted_text},
        {"serialization metadata", serialization_contains_quality_and_units},
    };

    int failed = 0;
    for (const auto& [name, test] : tests) {
        try {
            test();
            std::cout << "PASS " << name << '\n';
        } catch (const std::exception& error) {
            ++failed;
            std::cerr << "FAIL " << name << ": " << error.what() << '\n';
        }
    }
    std::cout << (tests.size() - static_cast<std::size_t>(failed)) << '/' << tests.size()
              << " tests passed\n";
    return failed == 0 ? 0 : 1;
}
