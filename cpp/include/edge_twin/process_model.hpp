/**
 * @file process_model.hpp
 * @brief Deterministic heated-tank physics with bounded actuator and state values.
 * @details See docs/generated/symbol-index.md for exact class, function, and field locations.
 */

#pragma once

#include "edge_twin/types.hpp"

namespace edge_twin {

/**
 * Advances the synthetic plant using a fixed time step.
 *
 * The model conserves liquid mass before clamping to physical capacity and uses
 * an energy balance for temperature. It is educational, not safety-certified.
 */
class ProcessModel {
  public:
    explicit ProcessModel(PlantParameters parameters = {});

    /** Advance the process by dt_s and return the actuator positions that took effect. */
    [[nodiscard]] ActuatorState step(double dt_s, const ActuatorState& requested,
                                     const FaultState& faults);

    /** Return the immutable current physical state. */
    [[nodiscard]] const PlantState& state() const noexcept;

    /** Return the immutable model parameters. */
    [[nodiscard]] const PlantParameters& parameters() const noexcept;

    /** Reset to a validated state, used by deterministic tests and scenarios. */
    void reset(const PlantState& initial);

  private:
    PlantParameters parameters_;
    PlantState state_{};
};

} // namespace edge_twin
