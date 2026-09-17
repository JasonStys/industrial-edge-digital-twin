/**
 * @file types.hpp
 * @brief Strong types and data contracts shared by the process, controller, and protocol layers.
 * @details Major symbols and their exact line locations are generated in
 *          docs/generated/symbol-index.md. Variables carry engineering units in their names.
 */

#pragma once

#include <cstdint>
#include <string>

namespace edge_twin {

/** Operating authority for the controller. */
enum class ControllerMode { stopped, manual, automatic };

/** Observable controller lifecycle state. */
enum class ControllerState { idle, starting, running, faulted, safe_shutdown };

/** Quality attached to every measured value. */
enum class SignalQuality { good, stale, bad, out_of_range };

/** Synthetic failures supported by the deterministic fault injector. */
enum class FaultKind {
    freeze_level_sensor,
    level_sensor_out_of_range,
    pump_stuck_on,
    heater_stuck_on
};

/** Tunable physical constants for the heated-tank model. */
struct PlantParameters {
    double capacity_l{1000.0};
    double max_inflow_lps{12.0};
    double max_outflow_lps{15.0};
    double heater_power_kw{30.0};
    double ambient_temperature_c{21.0};
    double inlet_temperature_c{18.0};
    double heat_loss_kw_per_c{0.025};
    double water_specific_heat_kj_per_kg_c{4.186};
};

/** Authoritative simulated physical state. */
struct PlantState {
    double level_l{500.0};
    double temperature_c{21.0};
    double simulation_time_s{0.0};
};

/** Normalized requested or actual actuator positions. */
struct ActuatorState {
    double pump_pct{0.0};
    double outlet_valve_pct{0.0};
    double heater_pct{0.0};
};

/** One engineering value with freshness and quality metadata. */
struct SignalSample {
    double value{0.0};
    double source_time_s{0.0};
    SignalQuality quality{SignalQuality::good};
};

/** Automatic-controller setpoints. */
struct ControlTargets {
    double level_l{600.0};
    double temperature_c{45.0};
};

/** Active fault switches; each is independently controllable. */
struct FaultState {
    bool freeze_level_sensor{false};
    bool level_sensor_out_of_range{false};
    bool pump_stuck_on{false};
    bool heater_stuck_on{false};
};

/** Current alarms and interlock outcomes. */
struct AlarmState {
    bool low_level{false};
    bool high_level{false};
    bool sensor_fault{false};
    bool heater_interlock{false};
    bool safe_state_active{false};
};

/** Complete telemetry envelope exposed to downstream consumers. */
struct Snapshot {
    std::uint64_t sequence{0};
    PlantState plant{};
    SignalSample level{};
    SignalSample temperature{};
    ActuatorState requested{};
    ActuatorState actual{};
    ControlTargets targets{};
    FaultState faults{};
    AlarmState alarms{};
    ControllerMode mode{ControllerMode::stopped};
    ControllerState controller_state{ControllerState::idle};
};

/** Result returned for every mutating command. */
struct CommandResult {
    bool accepted{false};
    bool duplicate{false};
    std::string command_id;
    std::string code;
    std::string message;
};

/** Convert enums to stable wire-format strings. */
[[nodiscard]] std::string to_string(ControllerMode value);
[[nodiscard]] std::string to_string(ControllerState value);
[[nodiscard]] std::string to_string(SignalQuality value);
[[nodiscard]] std::string to_string(FaultKind value);

} // namespace edge_twin
