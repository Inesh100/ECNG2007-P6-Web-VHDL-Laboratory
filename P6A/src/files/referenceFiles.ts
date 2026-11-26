/**
 * The prescribed, fixed P6A file model (P6A-FR-1, P6A-DC-03).
 *
 * Two files, one design and one testbench, following the Course HDL Artefact
 * Convention v1 as agreed with P6B in IF-P6-WS-01:
 *   - one design entity per file under src/
 *   - the testbench under tb/, named tb_<design>, which is also the simulation top
 *
 * The paths and top-level match P6B's fixtures exactly, which closes open item
 * R-02 in the System Integration Test Specification (the early prototype used
 * counter.vhd / counter_tb.vhd).
 *
 * These are stand-ins for the staff-supplied reference design/testbench until
 * the course fixtures are released (P6A-AD-02). Replace the text here only.
 */
import type { WorkspaceFile } from '../workspace/types';

export const REFERENCE_TOP = 'tb_counter';

export const COUNTER_PATH = 'src/counter.vhd';
export const TB_COUNTER_PATH = 'tb/tb_counter.vhd';

export const COUNTER_VHD = `-- counter.vhd : 4-bit synchronous up-counter with active-high reset
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
  generic (
    WIDTH : integer := 4
  );
  port (
    clk   : in  std_logic;
    rst   : in  std_logic;
    en    : in  std_logic;
    count : out std_logic_vector(WIDTH - 1 downto 0)
  );
end entity counter;

architecture rtl of counter is
  signal count_r : unsigned(WIDTH - 1 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        count_r <= (others => '0');
      elsif en = '1' then
        count_r <= count_r + 1;
      end if;
    end if;
  end process;

  count <= std_logic_vector(count_r);
end architecture rtl;
`;

export const TB_COUNTER_VHD = `-- tb_counter.vhd : self-checking testbench for counter
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_counter is
end entity tb_counter;

architecture sim of tb_counter is
  constant CLK_PERIOD : time := 10 ns;
  signal clk   : std_logic := '0';
  signal rst   : std_logic := '1';
  signal en    : std_logic := '0';
  signal count : std_logic_vector(3 downto 0);
begin
  dut : entity work.counter
    generic map (WIDTH => 4)
    port map (clk => clk, rst => rst, en => en, count => count);

  clk <= not clk after CLK_PERIOD / 2;

  stimulus : process
  begin
    wait for 2 * CLK_PERIOD;
    rst <= '0';
    en  <= '1';
    wait for 16 * CLK_PERIOD;
    en  <= '0';
    wait for 2 * CLK_PERIOD;
    assert unsigned(count) = 0
      report "counter did not wrap to zero" severity error;
    report "tb_counter finished" severity note;
    wait;
  end process;
end architecture sim;
`;

/** A fresh copy of the unmodified reference files, in display order. */
export function referenceFiles(): WorkspaceFile[] {
  return [
    { path: COUNTER_PATH, role: 'design', content: COUNTER_VHD },
    { path: TB_COUNTER_PATH, role: 'testbench', content: TB_COUNTER_VHD },
  ];
}
