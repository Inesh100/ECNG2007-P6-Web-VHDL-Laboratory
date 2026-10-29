
import type { Workspace } from "./types";

export const initialWorkspace: Workspace = {
  activeFileId: "counter",
  files: [
    {
      id: "counter",
      name: "counter.vhd",
      content: `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter is
    Port (
        clk   : in STD_LOGIC;
        reset : in STD_LOGIC;
        q     : out STD_LOGIC_VECTOR(3 downto 0)
    );
end counter;

architecture Behavioral of counter is
    signal count : unsigned(3 downto 0) := (others => '0');
begin
    process(clk, reset)
    begin
        if reset = '1' then
            count <= (others => '0');
        elsif rising_edge(clk) then
            count <= count + 1;
        end if;
    end process;

    q <= std_logic_vector(count);
end Behavioral;`
    },
    {
      id: "testbench",
      name: "counter_tb.vhd",
      content: `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity counter_tb is
end counter_tb;

architecture Behavioral of counter_tb is
    signal clk   : STD_LOGIC := '0';
    signal reset : STD_LOGIC := '1';
    signal q     : STD_LOGIC_VECTOR(3 downto 0);
begin
    uut: entity work.counter
        port map (
            clk => clk,
            reset => reset,
            q => q
        );

    clk <= not clk after 5 ns;

    process
    begin
        wait for 12 ns;
        reset <= '0';
        wait for 100 ns;
        wait;
    end process;
end Behavioral;`
    }
  ]
};
