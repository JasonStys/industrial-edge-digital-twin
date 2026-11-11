/**
 * @file electron-builder.config.cjs
 * @brief Package the sandboxed HMI, real gateway and statically linked C++ engine.
 * @details Jason Stys; outputs stay ignored below release and never contain user profiles.
 */
module.exports = {
  appId: "io.github.jasonstys.industrial-edge-digital-twin",
  productName: "Industrial Edge Digital Twin",
  directories: { output: process.env.TWIN_PACKAGE_OUTPUT || "release/windows" },
  files: ["desktop/main.mjs", "desktop/dist/**", "package.json"],
  extraMetadata: { main: "desktop/main.mjs", author: { name: "Jason Stys" } },
  extraResources: [
    { from: ".runtime/native-kernel/twin-engine.exe", to: "kernel/twin-engine.exe" },
    { from: "hmi/dist", to: "ui" },
    { from: ".runtime/package-source.json", to: "SOURCE.json" },
    { from: "LICENSE", to: "LICENSE.txt" },
  ],
  win: { target: "dir", executableName: "IndustrialEdgeDigitalTwin", signExecutable: false },
  asar: true,
};
