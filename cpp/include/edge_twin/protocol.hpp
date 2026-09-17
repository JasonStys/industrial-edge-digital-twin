/**
 * @file protocol.hpp
 * @brief Bounded text-command parsing and deterministic JSON serialization.
 * @details See docs/generated/symbol-index.md for exact symbol locations.
 */

#pragma once

#include "edge_twin/types.hpp"

#include <cstddef>
#include <string>
#include <vector>

namespace edge_twin {

/** Parsed form of one stdin protocol line. */
struct ProtocolCommand {
    std::string verb;
    std::vector<std::string> arguments;
};

/** Parse a whitespace-delimited ASCII command with explicit input bounds. */
[[nodiscard]] bool parse_protocol_line(const std::string& line, ProtocolCommand& output,
                                       std::string& error);

/** Escape untrusted text for embedding in a JSON string. */
[[nodiscard]] std::string json_escape(const std::string& value);

/** Serialize stable protocol envelopes without third-party runtime dependencies. */
[[nodiscard]] std::string snapshot_json(const Snapshot& snapshot);
[[nodiscard]] std::string command_result_json(const CommandResult& result,
                                              const Snapshot& snapshot);
[[nodiscard]] std::string protocol_error_json(const std::string& code, const std::string& message);

inline constexpr std::size_t max_protocol_line_bytes = 512;
inline constexpr std::size_t max_protocol_tokens = 16;

} // namespace edge_twin
