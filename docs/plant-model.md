# Plant model, units, and assumptions

## Synthetic process

The plant is a single, well-mixed heated tank with an inlet pump, outlet valve, and electric heater.
It is intentionally simple enough for each state transition to be inspected.

| Quantity              | Unit       | Default/range |
| --------------------- | ---------- | ------------- |
| Tank capacity         | L          | 1,000         |
| Initial level         | L          | 500           |
| Maximum inlet flow    | L/s        | 12            |
| Maximum outlet flow   | L/s        | 15            |
| Heater power          | kW         | 30            |
| Ambient temperature   | °C         | 21            |
| Inlet temperature     | °C         | 18            |
| Water specific heat   | kJ/(kg·°C) | 4.186         |
| Fixed simulation step | s          | 0.1           |

## Mass balance

For step duration \(\Delta t\), normalized pump position \(p\), and valve position \(v\):

\[ V_{in} = 12 \frac{L}{s} \cdot \frac{p}{100} \cdot \Delta t \]

\[ V_{out} = \min\left(15 \frac{L}{s} \cdot \frac{v}{100} \cdot \Delta t, V_{old} + V_{in}\right) \]

\[ V_{new} = clamp(V_{old} + V_{in} - V_{out}, 0, 1000) \]

The implementation calculates available liquid before outflow, preventing negative volume. The
property campaign exercises 2,000 mixed inputs and asserts the capacity invariant after every step.

## Energy balance

The model approximates one litre of water as one kilogram and assumes perfect mixing:

\[ E_{new} = E_{stored} + E_{inlet} - E_{outlet} + E_{heater} - E_{loss} \]

where \(1\ kW \cdot 1\ s = 1\ kJ\). Temperature is recovered from \(T_{new}=E_{new}/(V_{new}c_p)\).
An empty tank returns to ambient temperature. A final numerical clamp of -10–120 °C contains invalid
synthetic campaigns; it is not a physical operating claim.

## Controller

Automatic level control uses mutually exclusive proportional fill/drain output. Temperature uses a
proportional heater request. Centralized interlocks run after automatic or manual logic:

| Condition                    | Result                                               |
| ---------------------------- | ---------------------------------------------------- |
| Signal quality is not `good` | Controller `faulted`; all requested outputs 0%       |
| Level below 150 L            | Heater forced to 0%; interlock reported if requested |
| Level at/below 120 L         | Low alarm; heater forced to 0%                       |
| Level at/above 900 L         | High alarm; pump forced to 0%                        |
| Level at/above 950 L         | Pump forced to 0%                                    |
| Mode `stopped`               | All requested outputs 0%                             |

## Value, quality, and freshness

A sensor sample contains a numeric value, `source_time_s`, and quality. Freezing the level sensor
holds both value and source time. Once age exceeds 1.5 simulated seconds, quality becomes `stale`;
the controller does not infer freshness from an unchanged value.

## Deliberate omissions

The model excludes compressibility, pressure, evaporation, boiling, heat stratification, nonlinear
pump curves, valve deadband, sensor noise, calibration, electrical behavior, and PLC scan jitter.
Any real-world use would require a validated process model and hazard analysis.
