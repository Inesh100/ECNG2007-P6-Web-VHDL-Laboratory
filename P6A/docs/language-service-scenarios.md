# Approved language-service scenarios (P6-StR1.2 / P6-AC1.2)

**Status: P6A working copies (stand-ins).** The staff-supplied diagnostic/completion scenarios have not been released yet (P6A-AD-02). When they arrive, replace `src/languageService/scenarios.ts` and this table through a CR. `tests/unit/scenarios.test.ts` and `tests/integration/languageServer.test.ts` then check the new set automatically.

Every scenario starts from the unmodified reference files. Line numbers are 1-based, as in the editor gutter.

| ID | Kind | Edit (file: find → replace) | Approved response |
|---|---|---|---|
| LSP-01 | diagnostics | none | No problems in either file |
| LSP-02 | diagnostics | `src/counter.vhd`: drop the `;` after `count <= std_logic_vector(count_r)` | error, `src/counter.vhd` line 32: `';' is expected here` |
| LSP-03 | diagnostics | `src/counter.vhd`: `count_r <= count_r + 1;` → `cnt_r <= count_r + 1;` | error, line 27: `no declaration for "cnt_r"` |
| LSP-04 | diagnostics | `src/counter.vhd`: `end architecture rtl;` → `end architecture behav;` | error, line 33: `misspelling, "rtl" expected` |
| LSP-05 | diagnostics | `src/counter.vhd`: remove the inner `end if;` | error, line 29 (`end process`): `'end if' is expected` |
| LSP-06 | diagnostics | `tb/tb_counter.vhd`: `entity work.counter` → `entity work.count` | error, `tb/tb_counter.vhd` line 16: `unit "count" not found in library "work"` |
| LSP-07 | diagnostics | `src/counter.vhd`: add `signal spare : std_logic;` after `count_r` | warning, line 20: `signal "spare" is declared but never used` |
| LSP-08 | diagnostics | `src/counter.vhd`: `std_logic_vector(count_r);` → `std_logic_vector(count_r;` | error, line 32: `')' is expected to close this '('` |
| LSP-09 | completion | `tb/tb_counter.vhd`: `entity work.counter` → `entity work.`; cursor after `work.` | offers `counter`, `tb_counter`; does not offer `signal`, `std_logic` |
| LSP-10 | completion | `src/counter.vhd`: new line `cou` after the output assignment; cursor after `cou` | offers `count_r`, `count`, `clk`, `rst`, `en`, `WIDTH`, `rising_edge`, `std_logic_vector`, `process` |
| LSP-11 | completion | `src/counter.vhd`: `use ieee.numeric_std.all;` → `use ieee.`; cursor after `ieee.` | offers `std_logic_1164`, `numeric_std`; does not offer `count_r` |
| LSP-12 | hover | none; cursor on `count_r` in `count <= std_logic_vector(count_r);` | hover contains `signal count_r : unsigned(WIDTH - 1 downto 0)` |

## How staff check a scenario in the browser

1. Open the editor and wait for the status bar to show **VHDL language service: ready**.
2. Choose **Scenarios ▾ → LSP-xx**. The edit is applied as a new workspace revision, and the cursor jumps to the relevant line.
3. Diagnostics scenarios: the **APPROVED SCENARIO** tab shows the approved response with a live check (**✔ matches the approved response**). The squiggle and its hover message are visible in the editor, and the same entry appears in **PROBLEMS**.
4. Completion scenarios: the suggestion list opens at the cursor (press `Ctrl+Space` if it closed). Hover scenarios: the hover opens at the cursor.
5. **Reset files** restores the reference files.

`?scenario=LSP-02` in the URL loads a scenario on start-up.
