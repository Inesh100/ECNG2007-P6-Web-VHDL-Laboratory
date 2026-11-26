/**
 * VHDL reserved words and the predefined / IEEE names the simulator knows.
 * Kept deliberately small: only what the introductory file model needs.
 */

/** VHDL-2008 reserved words. */
export const KEYWORDS: ReadonlySet<string> = new Set(
  `abs access after alias all and architecture array assert assume assume_guarantee attribute begin block body buffer bus
   case component configuration constant context cover default disconnect downto else elsif end entity exit fairness file
   for force function generate generic group guarded if impure in inertial inout is label library linkage literal loop map
   mod nand new next nor not null of on open or others out package parameter port postponed procedure process property
   protected pure range record register reject release rem report restrict restrict_guarantee return rol ror select
   sequence severity shared signal sla sll sra srl strong subtype then to transport type unaffected units until use
   variable vmode vprop vunit wait when while with xnor xor`
    .split(/\s+/)
    .filter(Boolean),
);

export type StdNameKind = 'type' | 'function' | 'value' | 'unit' | 'library' | 'package' | 'attribute';

export interface StdName {
  name: string;
  kind: StdNameKind;
  detail: string;
}

const std = (kind: StdNameKind, detail: string, ...names: string[]): StdName[] =>
  names.map((name) => ({ name, kind, detail }));

/** Predefined and IEEE names that may be used without a local declaration. */
export const STD_NAMES: readonly StdName[] = [
  ...std('type', 'ieee.std_logic_1164', 'std_logic', 'std_logic_vector', 'std_ulogic', 'std_ulogic_vector'),
  ...std('type', 'ieee.numeric_std', 'unsigned', 'signed'),
  ...std('type', 'std.standard', 'bit', 'bit_vector', 'boolean', 'integer', 'natural', 'positive', 'real', 'time', 'string', 'character', 'severity_level', 'delay_length'),
  ...std('function', 'ieee.std_logic_1164: true on a rising clock edge', 'rising_edge'),
  ...std('function', 'ieee.std_logic_1164: true on a falling clock edge', 'falling_edge'),
  ...std('function', 'ieee.numeric_std conversion', 'to_unsigned', 'to_signed', 'to_integer', 'resize', 'std_match', 'to_01'),
  ...std('function', 'ieee.numeric_std shift/rotate', 'shift_left', 'shift_right', 'rotate_left', 'rotate_right'),
  ...std('function', 'ieee.std_logic_1164 conversion', 'to_stdlogicvector', 'to_stdulogicvector', 'to_bitvector', 'to_x01', 'to_hstring', 'to_string'),
  ...std('function', 'std.standard: current simulation time', 'now'),
  ...std('value', 'std.standard boolean literal', 'true', 'false'),
  ...std('value', 'std.standard severity level', 'note', 'warning', 'error', 'failure'),
  ...std('unit', 'std.standard time unit', 'fs', 'ps', 'ns', 'us', 'ms', 'sec', 'min', 'hr'),
  ...std('library', 'design library', 'ieee', 'std', 'work'),
  ...std('package', 'ieee package', 'std_logic_1164', 'numeric_std', 'math_real', 'numeric_bit', 'std_logic_textio', 'fixed_pkg', 'float_pkg'),
  ...std('package', 'std package', 'standard', 'textio', 'env'),
];

export const STD_NAME_MAP: ReadonlyMap<string, StdName> = new Map(STD_NAMES.map((n) => [n.name, n]));

/** Packages offered after "ieee." / "std." in a use clause. */
export const LIBRARY_PACKAGES: Readonly<Record<string, string[]>> = {
  ieee: ['std_logic_1164', 'numeric_std', 'math_real', 'numeric_bit', 'std_logic_textio', 'fixed_pkg', 'float_pkg'],
  std: ['standard', 'textio', 'env'],
};

/** Short hover texts for common keywords and names. */
export const HOVER_DOCS: Readonly<Record<string, string>> = {
  entity: 'Declares the interface (generics and ports) of a design unit.',
  architecture: 'Describes the implementation of an entity.',
  process: 'A sequential region that runs whenever a signal in its sensitivity list changes.',
  signal: 'Declares a signal: a wire or register shared between concurrent statements.',
  constant: 'Declares a named value that cannot change.',
  generic: 'Declares compile-time parameters of an entity.',
  port: 'Declares the inputs and outputs of an entity.',
  rising_edge: '`rising_edge(clk)` is true when `clk` changes from 0 to 1.',
  falling_edge: '`falling_edge(clk)` is true when `clk` changes from 1 to 0.',
  std_logic: 'Nine-valued logic type from `ieee.std_logic_1164`: U X 0 1 Z W L H -.',
  std_logic_vector: 'Array of `std_logic`, e.g. `std_logic_vector(3 downto 0)`.',
  unsigned: 'Array of `std_logic` treated as an unsigned number (`ieee.numeric_std`).',
  signed: "Array of `std_logic` treated as a two's-complement number (`ieee.numeric_std`).",
  wait: 'Suspends a process: `wait for 10 ns;`, `wait until clk = \'1\';` or `wait;` forever.',
  report: 'Prints a message during simulation, with an optional severity.',
  assert: 'Checks a condition during simulation and reports when it is false.',
};
