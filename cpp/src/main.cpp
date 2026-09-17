/**
 * @file main.cpp
 * @brief CLI entry point for interactive gateway mode and reproducible scenarios.
 * @details Functions and local variables are indexed in docs/generated/symbol-index.md.
 */

#include "edge_twin/engine.hpp"
#include "edge_twin/protocol.hpp"

#include <charconv>
#include <cstdlib>
#include <iostream>
#include <string>

namespace {

/** Parse a bounded positive integer without locale or allocation side effects. */
[[nodiscard]] bool parse_count(const std::string& text, int& output) {
    const char* const begin = text.data();
    const char* const end = begin + text.size();
    const auto result = std::from_chars(begin, end, output);
    return result.ec == std::errc{} && result.ptr == end && output > 0 && output <= 10000;
}

/** Execute the line protocol used by the TypeScript gateway. */
int run_stdio() {
    edge_twin::Engine engine;
    std::cout << edge_twin::snapshot_json(engine.snapshot()) << '\n' << std::flush;

    std::string line;
    while (std::getline(std::cin, line)) {
        edge_twin::ProtocolCommand command;
        std::string error;
        if (!edge_twin::parse_protocol_line(line, command, error)) {
            std::cout << edge_twin::protocol_error_json("invalid_line", error) << '\n'
                      << std::flush;
            continue;
        }

        if (command.verb == "TICK") {
            int count = 1;
            if (command.arguments.size() > 1U ||
                (command.arguments.size() == 1U && !parse_count(command.arguments[0], count))) {
                std::cout << edge_twin::protocol_error_json(
                                 "invalid_tick", "TICK accepts one integer from 1 through 10000")
                          << '\n'
                          << std::flush;
                continue;
            }
            edge_twin::Snapshot snapshot;
            for (int index = 0; index < count; ++index) {
                snapshot = engine.tick(0.1);
            }
            std::cout << edge_twin::snapshot_json(snapshot) << '\n' << std::flush;
        } else if (command.verb == "SNAPSHOT" && command.arguments.empty()) {
            std::cout << edge_twin::snapshot_json(engine.snapshot()) << '\n' << std::flush;
        } else if (command.verb == "COMMAND" && command.arguments.size() >= 2U) {
            const std::string command_id = command.arguments[0];
            const std::string operation = command.arguments[1];
            const std::vector<std::string> arguments(command.arguments.begin() + 2,
                                                     command.arguments.end());
            const edge_twin::CommandResult result =
                engine.apply_command(command_id, operation, arguments);
            std::cout << edge_twin::command_result_json(result, engine.snapshot()) << '\n'
                      << std::flush;
        } else if (command.verb == "QUIT" && command.arguments.empty()) {
            return EXIT_SUCCESS;
        } else {
            std::cout << edge_twin::protocol_error_json("unknown_command", "unsupported command")
                      << '\n'
                      << std::flush;
        }
    }
    return EXIT_SUCCESS;
}

/** Run a deterministic, script-friendly scenario and emit JSON Lines telemetry. */
int run_scenario(const std::string& name, const int steps) {
    edge_twin::Engine engine;
    const auto mode_result = engine.apply_command("scenario_mode", "set-mode", {"automatic"});
    if (!mode_result.accepted) {
        return EXIT_FAILURE;
    }

    for (int index = 0; index < steps; ++index) {
        if (name == "sensor-freeze" && index == steps / 3) {
            static_cast<void>(engine.apply_command("freeze_fault", "inject-fault",
                                                   {"freeze_level_sensor", "on"}));
        }
        std::cout << edge_twin::snapshot_json(engine.tick(0.1)) << '\n';
    }
    return EXIT_SUCCESS;
}

/** Print concise usage without hiding supported modes behind undocumented defaults. */
void print_usage() {
    std::cout << "Usage:\n"
              << "  twin-engine --stdio\n"
              << "  twin-engine --scenario nominal|sensor-freeze [--steps 300]\n";
}

} // namespace

int main(const int argc, char* argv[]) {
    if (argc == 2 && std::string(argv[1]) == "--stdio") {
        return run_stdio();
    }
    if (argc >= 3 && std::string(argv[1]) == "--scenario") {
        const std::string scenario = argv[2];
        if (scenario != "nominal" && scenario != "sensor-freeze") {
            print_usage();
            return EXIT_FAILURE;
        }
        int steps = 300;
        if (argc == 5 && std::string(argv[3]) == "--steps" && parse_count(argv[4], steps)) {
            return run_scenario(scenario, steps);
        }
        if (argc == 3) {
            return run_scenario(scenario, steps);
        }
    }
    print_usage();
    return EXIT_FAILURE;
}
