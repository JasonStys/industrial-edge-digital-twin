/**
 * @file controller.hpp
 * @brief State-machine controller, alarms, and safety interlocks for the digital twin.
 * @details See docs/generated/symbol-index.md for exact symbol locations.
 */

#pragma once

#include "edge_twin/types.hpp"

namespace edge_twin {

/** Controller limits are separate from the plant's absolute physical limits. */
struct ControllerLimits {
    double low_alarm_l{120.0};
    double minimum_heater_level_l{150.0};
    double high_alarm_l{900.0};
    double maximum_fill_level_l{950.0};
};

/**
 * Computes bounded outputs and applies safety interlocks after mode-specific logic.
 */
class Controller {
  public:
    explicit Controller(ControllerLimits limits = {});

    /** Select stopped, manual, or automatic operation. */
    void set_mode(ControllerMode mode) noexcept;

    /** Set automatic targets after the caller has validated their ranges. */
    void set_targets(ControlTargets targets) noexcept;

    /** Set requested manual outputs after the caller has validated their ranges. */
    void set_manual_outputs(ActuatorState outputs) noexcept;

    /**
     * Compute the next request from measured signals, then enforce interlocks.
     */
    [[nodiscard]] ActuatorState update(const SignalSample& level, const SignalSample& temperature);

    [[nodiscard]] ControllerMode mode() const noexcept;
    [[nodiscard]] ControllerState state() const noexcept;
    [[nodiscard]] const ControlTargets& targets() const noexcept;
    [[nodiscard]] const AlarmState& alarms() const noexcept;

  private:
    ControllerLimits limits_;
    ControllerMode mode_{ControllerMode::stopped};
    ControllerState state_{ControllerState::idle};
    ControlTargets targets_{};
    ActuatorState manual_outputs_{};
    AlarmState alarms_{};
};

} // namespace edge_twin
