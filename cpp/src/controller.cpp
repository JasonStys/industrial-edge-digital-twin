/**
 * @file controller.cpp
 * @brief Controller mode logic followed by centralized safety interlocks.
 * @details Exact function locations are generated in docs/generated/symbol-index.md.
 */

#include "edge_twin/controller.hpp"

#include <algorithm>

namespace edge_twin {
namespace {

/** A signal is usable for control only when its producer marks it good. */
[[nodiscard]] bool usable(const SignalSample& sample) noexcept {
    return sample.quality == SignalQuality::good;
}

} // namespace

Controller::Controller(ControllerLimits limits) : limits_(limits) {}

void Controller::set_mode(const ControllerMode mode) noexcept {
    mode_ = mode;
    state_ = mode == ControllerMode::stopped ? ControllerState::idle : ControllerState::starting;
}

void Controller::set_targets(const ControlTargets targets) noexcept { targets_ = targets; }

void Controller::set_manual_outputs(const ActuatorState outputs) noexcept {
    manual_outputs_ = outputs;
}

ActuatorState Controller::update(const SignalSample& level, const SignalSample& temperature) {
    alarms_ = {};
    alarms_.sensor_fault = !usable(level) || !usable(temperature);

    if (mode_ == ControllerMode::stopped) {
        state_ = ControllerState::idle;
        return {};
    }

    if (alarms_.sensor_fault) {
        state_ = ControllerState::faulted;
        alarms_.safe_state_active = true;
        return {};
    }

    alarms_.low_level = level.value <= limits_.low_alarm_l;
    alarms_.high_level = level.value >= limits_.high_alarm_l;

    ActuatorState output{};
    if (mode_ == ControllerMode::manual) {
        output = manual_outputs_;
    } else {
        const double level_error_l = targets_.level_l - level.value;
        if (level_error_l >= 0.0) {
            output.pump_pct = std::clamp(level_error_l * 0.8, 0.0, 100.0);
        } else {
            output.outlet_valve_pct = std::clamp(-level_error_l * 0.8, 0.0, 100.0);
        }
        output.heater_pct =
            std::clamp((targets_.temperature_c - temperature.value) * 10.0, 0.0, 100.0);
    }

    // Interlocks run after manual/automatic logic so no mode can bypass them.
    if (level.value < limits_.minimum_heater_level_l) {
        alarms_.heater_interlock = output.heater_pct > 0.0;
        output.heater_pct = 0.0;
    }
    if (level.value >= limits_.maximum_fill_level_l) {
        output.pump_pct = 0.0;
    }
    if (alarms_.low_level) {
        output.heater_pct = 0.0;
    }
    if (alarms_.high_level) {
        output.pump_pct = 0.0;
    }

    state_ = ControllerState::running;
    return output;
}

ControllerMode Controller::mode() const noexcept { return mode_; }

ControllerState Controller::state() const noexcept { return state_; }

const ControlTargets& Controller::targets() const noexcept { return targets_; }

const AlarmState& Controller::alarms() const noexcept { return alarms_; }

} // namespace edge_twin
