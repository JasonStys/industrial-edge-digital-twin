/**
 * @file process_model.cpp
 * @brief Fixed-step mass and energy balance for the heated-tank process.
 * @details Variables include unit suffixes; exact symbols are indexed in generated docs.
 */

#include "edge_twin/process_model.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace edge_twin {
namespace {

/** Constrain a normalized percentage to the physical actuator range. */
[[nodiscard]] double bounded_percent(const double value) noexcept {
    return std::clamp(value, 0.0, 100.0);
}

} // namespace

ProcessModel::ProcessModel(PlantParameters parameters) : parameters_(parameters) {
    if (!(parameters_.capacity_l > 0.0) || !(parameters_.max_inflow_lps >= 0.0) ||
        !(parameters_.max_outflow_lps >= 0.0) || !(parameters_.heater_power_kw >= 0.0) ||
        !(parameters_.water_specific_heat_kj_per_kg_c > 0.0)) {
        throw std::invalid_argument("plant parameters must define positive physical bounds");
    }
}

ActuatorState ProcessModel::step(const double dt_s, const ActuatorState& requested,
                                 const FaultState& faults) {
    if (!std::isfinite(dt_s) || dt_s <= 0.0 || dt_s > 10.0) {
        throw std::invalid_argument("dt_s must be finite and in (0, 10]");
    }

    ActuatorState actual{
        bounded_percent(requested.pump_pct),
        bounded_percent(requested.outlet_valve_pct),
        bounded_percent(requested.heater_pct),
    };
    if (faults.pump_stuck_on) {
        actual.pump_pct = 100.0;
    }
    if (faults.heater_stuck_on) {
        actual.heater_pct = 100.0;
    }

    const double inflow_l = parameters_.max_inflow_lps * (actual.pump_pct / 100.0) * dt_s;
    const double requested_outflow_l =
        parameters_.max_outflow_lps * (actual.outlet_valve_pct / 100.0) * dt_s;
    const double available_l = state_.level_l + inflow_l;
    const double outflow_l = std::min(requested_outflow_l, available_l);
    const double new_level_l = std::clamp(available_l - outflow_l, 0.0, parameters_.capacity_l);

    // Energy terms use kJ because 1 kW * 1 s = 1 kJ and 1 L of water is approximated as 1 kg.
    const double specific_heat = parameters_.water_specific_heat_kj_per_kg_c;
    const double stored_energy_kj = state_.level_l * specific_heat * state_.temperature_c;
    const double inlet_energy_kj = inflow_l * specific_heat * parameters_.inlet_temperature_c;
    const double outlet_energy_kj = outflow_l * specific_heat * state_.temperature_c;
    const double heater_energy_kj =
        parameters_.heater_power_kw * (actual.heater_pct / 100.0) * dt_s;
    const double heat_loss_kj = parameters_.heat_loss_kw_per_c *
                                (state_.temperature_c - parameters_.ambient_temperature_c) * dt_s;

    if (new_level_l > 1e-9) {
        const double new_energy_kj =
            stored_energy_kj + inlet_energy_kj - outlet_energy_kj + heater_energy_kj - heat_loss_kj;
        state_.temperature_c =
            std::clamp(new_energy_kj / (new_level_l * specific_heat), -10.0, 120.0);
    } else {
        state_.temperature_c = parameters_.ambient_temperature_c;
    }

    state_.level_l = new_level_l;
    state_.simulation_time_s += dt_s;
    return actual;
}

const PlantState& ProcessModel::state() const noexcept { return state_; }

const PlantParameters& ProcessModel::parameters() const noexcept { return parameters_; }

void ProcessModel::reset(const PlantState& initial) {
    if (!std::isfinite(initial.level_l) || !std::isfinite(initial.temperature_c) ||
        !std::isfinite(initial.simulation_time_s) || initial.level_l < 0.0 ||
        initial.level_l > parameters_.capacity_l || initial.simulation_time_s < 0.0) {
        throw std::invalid_argument("initial plant state is outside physical bounds");
    }
    state_ = initial;
}

} // namespace edge_twin
