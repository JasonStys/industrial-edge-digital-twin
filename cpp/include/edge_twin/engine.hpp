/**
 * @file engine.hpp
 * @brief Coordinates physics, sensing, control, fault injection, and idempotent commands.
 * @details See docs/generated/symbol-index.md for exact symbol locations.
 */

#pragma once

#include "edge_twin/controller.hpp"
#include "edge_twin/process_model.hpp"

#include <cstddef>
#include <deque>
#include <string>
#include <unordered_map>
#include <vector>

namespace edge_twin {

/**
 * Deterministic orchestration boundary used by both the CLI and the gateway.
 */
class Engine {
  public:
    Engine();

    /** Advance one fixed simulation interval; dt_s must be finite and positive. */
    [[nodiscard]] Snapshot tick(double dt_s);

    /** Apply a validated line-protocol command exactly once per command_id. */
    [[nodiscard]] CommandResult apply_command(const std::string& command_id,
                                              const std::string& operation,
                                              const std::vector<std::string>& arguments);

    /** Return the most recent telemetry without advancing time. */
    [[nodiscard]] Snapshot snapshot() const;

  private:
    [[nodiscard]] SignalSample sample_level() const;
    [[nodiscard]] SignalSample sample_temperature() const;
    [[nodiscard]] CommandResult execute_command(const std::string& command_id,
                                                const std::string& operation,
                                                const std::vector<std::string>& arguments);
    void remember_result(const CommandResult& result);

    ProcessModel process_{};
    Controller controller_{};
    FaultState faults_{};
    ActuatorState manual_outputs_{};
    ActuatorState requested_{};
    ActuatorState actual_{};
    std::uint64_t sequence_{0};
    double frozen_level_l_{500.0};
    double freeze_started_s_{0.0};
    std::unordered_map<std::string, CommandResult> command_results_;
    std::deque<std::string> command_order_;
    static constexpr std::size_t max_command_history_ = 256;
};

} // namespace edge_twin
