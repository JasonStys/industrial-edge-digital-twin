/**
 * @file engine.cpp
 * @brief Digital-twin orchestration and bounded, idempotent command handling.
 * @details Exact function and field locations are generated in the symbol index.
 */

#include "edge_twin/engine.hpp"

#include <cctype>
#include <charconv>
#include <cmath>
#include <optional>
#include <string_view>

namespace edge_twin {
namespace {

/** Parse a finite decimal while rejecting trailing characters and special values. */
[[nodiscard]] std::optional<double> parse_number(const std::string& text) {
    double value = 0.0;
    const char* const begin = text.data();
    const char* const end = begin + text.size();
    const auto result = std::from_chars(begin, end, value);
    if (result.ec != std::errc{} || result.ptr != end || !std::isfinite(value)) {
        return std::nullopt;
    }
    return value;
}

/** Command identifiers are intentionally narrow because they cross process and log boundaries. */
[[nodiscard]] bool valid_command_id(const std::string& value) {
    if (value.empty() || value.size() > 64U) {
        return false;
    }
    for (const unsigned char character : value) {
        if (!std::isalnum(character) && character != '-' && character != '_') {
            return false;
        }
    }
    return true;
}

/** Construct a consistent command result. */
[[nodiscard]] CommandResult result(const bool accepted, const std::string& command_id,
                                   std::string code, std::string message) {
    return {accepted, false, command_id, std::move(code), std::move(message)};
}

} // namespace

Engine::Engine() = default;

Snapshot Engine::tick(const double dt_s) {
    const SignalSample level = sample_level();
    const SignalSample temperature = sample_temperature();
    requested_ = controller_.update(level, temperature);
    actual_ = process_.step(dt_s, requested_, faults_);
    ++sequence_;
    return snapshot();
}

CommandResult Engine::apply_command(const std::string& command_id, const std::string& operation,
                                    const std::vector<std::string>& arguments) {
    if (!valid_command_id(command_id)) {
        return result(false, command_id, "invalid_command_id",
                      "command_id must contain 1-64 letters, digits, hyphens, or underscores");
    }

    if (const auto previous = command_results_.find(command_id);
        previous != command_results_.end()) {
        CommandResult duplicate = previous->second;
        duplicate.duplicate = true;
        return duplicate;
    }

    CommandResult command_result = execute_command(command_id, operation, arguments);
    remember_result(command_result);
    return command_result;
}

Snapshot Engine::snapshot() const {
    return {
        sequence_,
        process_.state(),
        sample_level(),
        sample_temperature(),
        requested_,
        actual_,
        controller_.targets(),
        faults_,
        controller_.alarms(),
        controller_.mode(),
        controller_.state(),
    };
}

SignalSample Engine::sample_level() const {
    const PlantState& state = process_.state();
    if (faults_.level_sensor_out_of_range) {
        return {process_.parameters().capacity_l + 100.0, state.simulation_time_s,
                SignalQuality::out_of_range};
    }
    if (faults_.freeze_level_sensor) {
        const double age_s = state.simulation_time_s - freeze_started_s_;
        const SignalQuality quality = age_s > 1.5 ? SignalQuality::stale : SignalQuality::good;
        return {frozen_level_l_, freeze_started_s_, quality};
    }
    return {state.level_l, state.simulation_time_s, SignalQuality::good};
}

SignalSample Engine::sample_temperature() const {
    const PlantState& state = process_.state();
    return {state.temperature_c, state.simulation_time_s, SignalQuality::good};
}

CommandResult Engine::execute_command(const std::string& command_id, const std::string& operation,
                                      const std::vector<std::string>& arguments) {
    if (operation == "set-mode") {
        if (arguments.size() != 1U) {
            return result(false, command_id, "invalid_arguments", "set-mode requires one mode");
        }
        if (arguments[0] == "stopped") {
            controller_.set_mode(ControllerMode::stopped);
        } else if (arguments[0] == "manual") {
            controller_.set_mode(ControllerMode::manual);
        } else if (arguments[0] == "automatic") {
            controller_.set_mode(ControllerMode::automatic);
        } else {
            return result(false, command_id, "invalid_mode",
                          "mode must be stopped, manual, or automatic");
        }
        return result(true, command_id, "accepted", "controller mode updated");
    }

    if (operation == "set-target") {
        if (arguments.size() != 2U) {
            return result(false, command_id, "invalid_arguments",
                          "set-target requires a field and numeric value");
        }
        const auto value = parse_number(arguments[1]);
        if (!value.has_value()) {
            return result(false, command_id, "invalid_number", "target must be a finite decimal");
        }
        ControlTargets targets = controller_.targets();
        if (arguments[0] == "level_l" && *value >= 50.0 && *value <= 950.0) {
            targets.level_l = *value;
        } else if (arguments[0] == "temperature_c" && *value >= 5.0 && *value <= 95.0) {
            targets.temperature_c = *value;
        } else {
            return result(false, command_id, "target_out_of_range",
                          "level_l must be 50-950; temperature_c must be 5-95");
        }
        controller_.set_targets(targets);
        return result(true, command_id, "accepted", "automatic target updated");
    }

    if (operation == "set-output") {
        if (arguments.size() != 2U) {
            return result(false, command_id, "invalid_arguments",
                          "set-output requires an actuator and percentage");
        }
        if (controller_.mode() != ControllerMode::manual) {
            return result(false, command_id, "wrong_mode",
                          "manual outputs may change only while mode is manual");
        }
        const auto value = parse_number(arguments[1]);
        if (!value.has_value() || *value < 0.0 || *value > 100.0) {
            return result(false, command_id, "output_out_of_range",
                          "actuator percentage must be within 0-100");
        }
        if (arguments[0] == "pump_pct") {
            manual_outputs_.pump_pct = *value;
        } else if (arguments[0] == "outlet_valve_pct") {
            manual_outputs_.outlet_valve_pct = *value;
        } else if (arguments[0] == "heater_pct") {
            manual_outputs_.heater_pct = *value;
        } else {
            return result(false, command_id, "unknown_actuator",
                          "actuator must be pump_pct, outlet_valve_pct, or heater_pct");
        }
        controller_.set_manual_outputs(manual_outputs_);
        return result(true, command_id, "accepted", "manual output updated");
    }

    if (operation == "inject-fault") {
        if (arguments.size() != 2U || (arguments[1] != "on" && arguments[1] != "off")) {
            return result(false, command_id, "invalid_arguments",
                          "inject-fault requires a fault name followed by on or off");
        }
        const bool enabled = arguments[1] == "on";
        if (arguments[0] == "freeze_level_sensor") {
            if (enabled && !faults_.freeze_level_sensor) {
                frozen_level_l_ = process_.state().level_l;
                freeze_started_s_ = process_.state().simulation_time_s;
            }
            faults_.freeze_level_sensor = enabled;
        } else if (arguments[0] == "level_sensor_out_of_range") {
            faults_.level_sensor_out_of_range = enabled;
        } else if (arguments[0] == "pump_stuck_on") {
            faults_.pump_stuck_on = enabled;
        } else if (arguments[0] == "heater_stuck_on") {
            faults_.heater_stuck_on = enabled;
        } else {
            return result(false, command_id, "unknown_fault", "fault name is not supported");
        }
        return result(true, command_id, "accepted", "fault state updated");
    }

    if (operation == "clear-faults" && arguments.empty()) {
        faults_ = {};
        return result(true, command_id, "accepted", "all injected faults cleared");
    }

    return result(false, command_id, "unknown_operation", "operation is not supported");
}

void Engine::remember_result(const CommandResult& command_result) {
    if (command_order_.size() >= max_command_history_) {
        command_results_.erase(command_order_.front());
        command_order_.pop_front();
    }
    command_order_.push_back(command_result.command_id);
    command_results_.insert_or_assign(command_result.command_id, command_result);
}

} // namespace edge_twin
