/**
 * @file protocol.cpp
 * @brief Defensive stdin parsing and dependency-free JSON wire serialization.
 * @details Exact symbol locations are generated in docs/generated/symbol-index.md.
 */

#include "edge_twin/protocol.hpp"

#include <cctype>
#include <iomanip>
#include <sstream>

namespace edge_twin {
namespace {

/** Write a JSON boolean with no locale-sensitive conversion. */
void write_bool(std::ostringstream& output, const bool value) {
    output << (value ? "true" : "false");
}

/** Write all actuator fields in their stable API order. */
void write_actuators(std::ostringstream& output, const ActuatorState& value) {
    output << "{\"pump_pct\":" << value.pump_pct
           << ",\"outlet_valve_pct\":" << value.outlet_valve_pct
           << ",\"heater_pct\":" << value.heater_pct << '}';
}

/** Write one measurement with value, source timestamp, and quality. */
void write_signal(std::ostringstream& output, const SignalSample& value) {
    output << "{\"value\":" << value.value << ",\"source_time_s\":" << value.source_time_s
           << ",\"quality\":\"" << to_string(value.quality) << "\"}";
}

/** Write the nested snapshot body shared by telemetry and command responses. */
void write_snapshot(std::ostringstream& output, const Snapshot& value) {
    output << "{\"sequence\":" << value.sequence
           << ",\"simulation_time_s\":" << value.plant.simulation_time_s << ",\"mode\":\""
           << to_string(value.mode) << "\",\"controller_state\":\""
           << to_string(value.controller_state)
           << "\",\"plant\":{\"level_l\":" << value.plant.level_l
           << ",\"temperature_c\":" << value.plant.temperature_c << "},\"signals\":{\"level\":";
    write_signal(output, value.level);
    output << ",\"temperature\":";
    write_signal(output, value.temperature);
    output << "},\"requested\":";
    write_actuators(output, value.requested);
    output << ",\"actual\":";
    write_actuators(output, value.actual);
    output << ",\"targets\":{\"level_l\":" << value.targets.level_l
           << ",\"temperature_c\":" << value.targets.temperature_c << "},\"faults\":{";
    output << "\"freeze_level_sensor\":";
    write_bool(output, value.faults.freeze_level_sensor);
    output << ",\"level_sensor_out_of_range\":";
    write_bool(output, value.faults.level_sensor_out_of_range);
    output << ",\"pump_stuck_on\":";
    write_bool(output, value.faults.pump_stuck_on);
    output << ",\"heater_stuck_on\":";
    write_bool(output, value.faults.heater_stuck_on);
    output << "},\"alarms\":{\"low_level\":";
    write_bool(output, value.alarms.low_level);
    output << ",\"high_level\":";
    write_bool(output, value.alarms.high_level);
    output << ",\"sensor_fault\":";
    write_bool(output, value.alarms.sensor_fault);
    output << ",\"heater_interlock\":";
    write_bool(output, value.alarms.heater_interlock);
    output << ",\"safe_state_active\":";
    write_bool(output, value.alarms.safe_state_active);
    output << "}}";
}

} // namespace

bool parse_protocol_line(const std::string& line, ProtocolCommand& output, std::string& error) {
    output = {};
    error.clear();
    if (line.empty()) {
        error = "command line is empty";
        return false;
    }
    if (line.size() > max_protocol_line_bytes) {
        error = "command line exceeds 512 bytes";
        return false;
    }
    for (const unsigned char character : line) {
        if ((character < 0x20U && character != '\t') || character > 0x7eU) {
            error = "command line must contain printable ASCII";
            return false;
        }
    }

    std::istringstream input(line);
    std::string token;
    std::vector<std::string> tokens;
    while (input >> token) {
        if (tokens.size() >= max_protocol_tokens) {
            error = "command line contains too many tokens";
            return false;
        }
        tokens.push_back(token);
    }
    if (tokens.empty()) {
        error = "command line contains no tokens";
        return false;
    }
    output.verb = tokens.front();
    output.arguments.assign(tokens.begin() + 1, tokens.end());
    return true;
}

std::string json_escape(const std::string& value) {
    std::ostringstream output;
    output << std::hex << std::setfill('0');
    for (const unsigned char character : value) {
        switch (character) {
        case '"':
            output << "\\\"";
            break;
        case '\\':
            output << "\\\\";
            break;
        case '\b':
            output << "\\b";
            break;
        case '\f':
            output << "\\f";
            break;
        case '\n':
            output << "\\n";
            break;
        case '\r':
            output << "\\r";
            break;
        case '\t':
            output << "\\t";
            break;
        default:
            if (character < 0x20U) {
                output << "\\u" << std::setw(4) << static_cast<unsigned int>(character);
            } else {
                output << static_cast<char>(character);
            }
        }
    }
    return output.str();
}

std::string snapshot_json(const Snapshot& snapshot) {
    std::ostringstream output;
    output << std::fixed << std::setprecision(3) << "{\"type\":\"telemetry\",\"snapshot\":";
    write_snapshot(output, snapshot);
    output << '}';
    return output.str();
}

std::string command_result_json(const CommandResult& result, const Snapshot& snapshot) {
    std::ostringstream output;
    output << std::fixed << std::setprecision(3) << "{\"type\":\"command_result\",\"result\":{";
    output << "\"accepted\":";
    write_bool(output, result.accepted);
    output << ",\"duplicate\":";
    write_bool(output, result.duplicate);
    output << ",\"command_id\":\"" << json_escape(result.command_id) << "\",\"code\":\""
           << json_escape(result.code) << "\",\"message\":\"" << json_escape(result.message)
           << "\"},\"snapshot\":";
    write_snapshot(output, snapshot);
    output << '}';
    return output.str();
}

std::string protocol_error_json(const std::string& code, const std::string& message) {
    return "{\"type\":\"protocol_error\",\"code\":\"" + json_escape(code) + "\",\"message\":\"" +
           json_escape(message) + "\"}";
}

} // namespace edge_twin
