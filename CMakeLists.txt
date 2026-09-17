# File: CMakeLists.txt
# Purpose: Configure the C++20 engine, CLI, tests, warnings, sanitizers, and coverage hooks.
# Symbol locations: docs/generated/symbol-index.md records code symbols; this declarative file is indexed by section.

cmake_minimum_required(VERSION 3.25)
project(industrial_edge_digital_twin VERSION 1.0.0 LANGUAGES CXX)

option(EDGE_TWIN_ENABLE_SANITIZERS "Enable AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
option(EDGE_TWIN_ENABLE_COVERAGE "Enable GCC/Clang coverage instrumentation" OFF)

add_library(edge_twin_core
    cpp/src/controller.cpp
    cpp/src/engine.cpp
    cpp/src/process_model.cpp
    cpp/src/protocol.cpp
    cpp/src/types.cpp
)
target_include_directories(edge_twin_core PUBLIC cpp/include)
target_compile_features(edge_twin_core PUBLIC cxx_std_20)

if(MSVC)
    target_compile_options(edge_twin_core PRIVATE /W4 /WX /permissive- /EHsc)
else()
    target_compile_options(edge_twin_core PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Werror)
endif()

if(EDGE_TWIN_ENABLE_SANITIZERS AND NOT MSVC)
    target_compile_options(edge_twin_core PUBLIC -fsanitize=address,undefined -fno-omit-frame-pointer)
    target_link_options(edge_twin_core PUBLIC -fsanitize=address,undefined)
endif()

if(EDGE_TWIN_ENABLE_COVERAGE AND CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(edge_twin_core PUBLIC --coverage -O0 -g)
    target_link_options(edge_twin_core PUBLIC --coverage)
endif()

add_executable(twin-engine cpp/src/main.cpp)
target_link_libraries(twin-engine PRIVATE edge_twin_core)
if(MSVC)
    target_compile_options(twin-engine PRIVATE /W4 /WX /permissive- /EHsc)
else()
    target_compile_options(twin-engine PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Werror)
endif()

enable_testing()
add_executable(edge_twin_tests cpp/tests/test_main.cpp)
target_link_libraries(edge_twin_tests PRIVATE edge_twin_core)
if(MSVC)
    target_compile_options(edge_twin_tests PRIVATE /W4 /WX /permissive- /EHsc)
else()
    target_compile_options(edge_twin_tests PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Werror)
endif()
add_test(NAME edge_twin_tests COMMAND edge_twin_tests)

install(TARGETS twin-engine RUNTIME DESTINATION bin)
