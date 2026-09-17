/**
 * @file types.cpp
 * @brief Stable wire-format names for strongly typed enumerations.
 * @details Functions are indexed in docs/generated/symbol-index.md.
 */

#include "edge_twin/types.hpp"

namespace edge_twin {

std::string to_string(const ControllerMode value) {
    switch (value) {
    case ControllerMode::stopped:
        return "stopped";
    case ControllerMode::manual:
        return "manual";
    case ControllerMode::automatic:
        return "automatic";
    }
    return "unknown";
}

std::string to_string(const ControllerState value) {
    switch (value) {
    case ControllerState::idle:
        return "idle";
    case ControllerState::starting:
        return "starting";
    case ControllerState::running:
        return "running";
    case ControllerState::faulted:
        return "faulted";
    case ControllerState::safe_shutdown:
        return "safe_shutdown";
    }
    return "unknown";
}

std::string to_string(const SignalQuality value) {
    switch (value) {
    case SignalQuality::good:
        return "good";
    case SignalQuality::stale:
        return "stale";
    case SignalQuality::bad:
        return "bad";
    case SignalQuality::out_of_range:
        return "out_of_range";
    }
    return "unknown";
}

std::string to_string(const FaultKind value) {
    switch (value) {
    case FaultKind::freeze_level_sensor:
        return "freeze_level_sensor";
    case FaultKind::level_sensor_out_of_range:
        return "level_sensor_out_of_range";
    case FaultKind::pump_stuck_on:
        return "pump_stuck_on";
    case FaultKind::heater_stuck_on:
        return "heater_stuck_on";
    }
    return "unknown";
}

} // namespace edge_twin
