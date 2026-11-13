/**
 * Parent-project service simulator - execution engine (P6B-FR-05, P6B-DC-04).
 *
 * This is a TEST DOUBLE for the Project 5 GHDL execution service. It is not a
 * VHDL simulator and makes no claim to be one. It implements just enough
 * deterministic behaviour for the prescribed counter file model so that P6B can
 * be verified against HDL Service Contract v1 without Project 5:
 *
 *   - analysis    : lightweight structural checks (balanced brackets, block
 *                   closure, missing ';', unknown work.<entity>)
 *   - elaboration : top unit present, port/generic width agreement
 *   - simulation  : interprets the prescribed testbench stimulus pattern
 *                   (wait / signal assignment / assert / report) against a
 *                   behavioural model of the counter and writes a VCD
 *   - service     : resource limit (max simulated time) and malformed requests
 *
 * The same engine backs the in-browser embedded transport and the Node
 * REST/WebSocket simulator server, so both behave identically.
 */
import {
  HDL_CONTRACT_VERSION,
  type Artefact,
  type JobFailure,
  type JobRequest,
  type JobResult,
  type JobStage,
  type LogEntry,
  type ToolDiagnostic,
} from '../contracts/hdlService';
import { writeVcd, type VcdChange, type VcdSignal } from './vcd';

/** Simulator resource ceiling (stand-in for the course time/resource limit). */
export const MAX_SIM_TIME_NS = 1_000_000; // 1 ms

export interface EngineStep {
  stage: JobStage;
  logs: LogEntry[];
}

export interface EngineOutcome {
  steps: EngineStep[];
  result: Omit<JobResult, 'jobId'>;
}

// ---------------------------------------------------------------- helpers

/** Removes VHDL comments and string literals while keeping line/column positions. */
export function stripCommentsAndStrings(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      let out = '';
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (!inStr && ch === '-' && line[i + 1] === '-') {
          out += ' '.repeat(line.length - i);
          break;
        }
        if (ch === '"') {
          inStr = !inStr;
          out += ' ';
          continue;
        }
        // character literals like '0' are kept; they never contain ';'
        out += inStr ? ' ' : ch;
      }
      return out;
    })
    .join('\n');
}

export function parseTimeNs(text: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(fs|ps|ns|us|ms|sec|s)\s*$/i.exec(text);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const scale: Record<string, number> = { fs: 1e-6, ps: 1e-3, ns: 1, us: 1e3, ms: 1e6, s: 1e9, sec: 1e9 };
  return n * scale[unit];
}

function fmtNs(ns: number): string {
  return `${Math.round(ns)} ns`;
}

const CONTINUATION_END = /(\bis|\bthen|\belse|\bbegin|\bloop|\bgenerate|\(|,|=>|<=|:=|\band|\bor|\bxor|\bnot|[+\-*/&=])\s*$/i;
const NEW_STATEMENT_START =
  /^\s*(signal|constant|variable|begin|end|port|generic|architecture|entity|library|use|process|if|elsif|else|wait|assert|report|case|when|for|while|return|type|subtype|component|[a-z_]\w*\s*(<=|:=))/i;

// ---------------------------------------------------------------- analysis

export function analyse(files: JobRequest['files']): ToolDiagnostic[] {
  const diags: ToolDiagnostic[] = [];
  const declaredEntities = collectEntities(files);

  for (const f of files) {
    const clean = stripCommentsAndStrings(f.content);
    const lines = clean.split('\n');

    // 1. balanced parentheses
    let depth = 0;
    lines.forEach((line, i) => {
      for (let c = 0; c < line.length; c++) {
        if (line[c] === '(') depth++;
        if (line[c] === ')') {
          depth--;
          if (depth < 0) {
            diags.push({ file: f.path, line: i + 1, column: c + 1, severity: 'error', message: "unexpected ')'" });
            depth = 0;
          }
        }
      }
    });
    if (depth > 0) diags.push({ file: f.path, line: lines.length, column: 1, severity: 'error', message: "missing ')' before end of file" });

    // 2. missing ';' between statements
    const sig = lines.map((l, i) => ({ text: l.trim(), line: i + 1 })).filter((l) => l.text.length > 0);
    for (let i = 0; i < sig.length - 1; i++) {
      const cur = sig[i].text;
      const next = sig[i + 1].text;
      if (cur.endsWith(';')) continue;
      if (CONTINUATION_END.test(cur)) continue;
      if (/\bprocess\b/i.test(cur) || /^assert\b/i.test(cur) || /\bmap\s*\(/i.test(cur) || /^(\w+\s*:\s*)?entity\s+work\./i.test(cur)) continue;
      if (/^\(/.test(next) || /^\)/.test(next)) continue;
      if (/^(report|severity)\b/i.test(next) && /^assert\b/i.test(sig[Math.max(0, i - 1)].text + ' ' + cur)) continue;
      if (/^(report|severity)\b/i.test(next)) continue;
      if (NEW_STATEMENT_START.test(next)) {
        diags.push({ file: f.path, line: sig[i].line, column: lines[sig[i].line - 1].trimEnd().length + 1, severity: 'error', message: "';' is expected here" });
      }
    }

    // 3. block closure: if/end if, process/end process, entity/architecture end
    const text = clean.toLowerCase();
    const count = (re: RegExp) => (text.match(re) ?? []).length;
    const endIfs = count(/\bend\s+if\b/g);
    const openIfs = count(/(^|\s)if\s[^;]*?\bthen\b/g);
    if (openIfs !== endIfs) {
      diags.push({ file: f.path, line: lastLineMatching(lines, /\bend\b/i), severity: 'error', message: openIfs > endIfs ? "'end if' is expected" : "unexpected 'end if'" });
    }
    const procs = count(/(?<!end\s+)\bprocess\b/g) - count(/\bend\s+process\b/g);
    if (procs !== 0) diags.push({ file: f.path, line: lastLineMatching(lines, /\bend\b/i), severity: 'error', message: procs > 0 ? "'end process' is expected" : "unexpected 'end process'" });
    for (const kind of ['entity', 'architecture'] as const) {
      const opens = count(new RegExp(`(^|\\n)\\s*${kind}\\s+\\w+\\s+(of\\s+\\w+\\s+)?is\\b`, 'g'));
      if (opens === 0) continue;
      const ends = count(new RegExp(`\\bend\\s+${kind}\\b`, 'g'));
      if (ends < opens) {
        // allow "end <name>;" / "end;" forms
        const looseEnds = count(/\bend\s*(\w+)?\s*;/g) - count(/\bend\s+(if|process|entity|architecture|loop|case|generate|component|record)\b/g);
        if (ends + looseEnds < opens) diags.push({ file: f.path, line: lines.length, severity: 'error', message: `'end ${kind}' is expected` });
      }
    }

    // 4. direct instantiation of an entity that was never analysed
    lines.forEach((line, i) => {
      const m = /\bentity\s+work\.(\w+)/i.exec(line);
      if (m && !declaredEntities.has(m[1].toLowerCase())) {
        diags.push({ file: f.path, line: i + 1, column: line.toLowerCase().indexOf('work.') + 6, severity: 'error', message: `unit "${m[1].toLowerCase()}" not found in library "work"` });
      }
    });
  }
  return diags;
}

function lastLineMatching(lines: string[], re: RegExp): number {
  for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) return i + 1;
  return lines.length;
}

export function collectEntities(files: JobRequest['files']): Set<string> {
  const set = new Set<string>();
  for (const f of files) {
    const clean = stripCommentsAndStrings(f.content);
    for (const m of clean.matchAll(/(^|\n)\s*entity\s+(\w+)\s+is\b/gi)) set.add(m[2].toLowerCase());
  }
  return set;
}

// ------------------------------------------------------------- elaboration

interface Model {
  width: number;
  tbCountWidth: number;
  clkPeriodNs: number;
}

export function elaborate(req: JobRequest): { diags: ToolDiagnostic[]; model?: Model } {
  const diags: ToolDiagnostic[] = [];
  const entities = collectEntities(req.files);
  if (!entities.has(req.top.toLowerCase())) {
    diags.push({ severity: 'error', message: `cannot find entity or configuration ${req.top.toLowerCase()}` });
    return { diags };
  }
  const tb = req.files.find((f) => new RegExp(`entity\\s+${req.top}\\s+is`, 'i').test(f.content));
  const design = req.files.find((f) => f.role === 'design');
  const tbText = stripCommentsAndStrings(tb?.content ?? '');
  const dText = stripCommentsAndStrings(design?.content ?? '');

  const defaultWidth = parseInt(/WIDTH\s*:\s*integer\s*:=\s*(\d+)/i.exec(dText)?.[1] ?? '4', 10);
  const mappedWidth = /WIDTH\s*=>\s*(\d+)/i.exec(tbText)?.[1];
  const width = mappedWidth ? parseInt(mappedWidth, 10) : defaultWidth;
  const countSig = /signal\s+count\s*:\s*std_logic_vector\s*\(\s*(\d+)\s+downto\s+0\s*\)/i.exec(tbText);
  const tbCountWidth = countSig ? parseInt(countSig[1], 10) + 1 : width;
  const period = /CLK_PERIOD\s*:\s*time\s*:=\s*([^;]+);/i.exec(tbText)?.[1];
  const clkPeriodNs = period ? parseTimeNs(period) ?? 10 : 10;

  if (width < 1 || width > 32) {
    diags.push({ file: tb?.path, severity: 'error', message: `generic WIDTH = ${width} is outside the supported range 1..32` });
  }
  if (tbCountWidth !== width) {
    const line = tb ? tb.content.split('\n').findIndex((l) => /port\s+map/i.test(l)) + 1 : undefined;
    diags.push({
      file: tb?.path,
      line: line || undefined,
      severity: 'error',
      message: `port "count" of entity "counter": actual length ${tbCountWidth} does not match formal length ${width}`,
    });
  }
  if (clkPeriodNs <= 0) diags.push({ file: tb?.path, severity: 'error', message: 'CLK_PERIOD must be positive' });
  if (diags.length) return { diags };
  return { diags, model: { width, tbCountWidth, clkPeriodNs } };
}

// -------------------------------------------------------------- simulation

type Stmt =
  | { kind: 'wait'; ns: number; line: number }
  | { kind: 'waitForever'; line: number }
  | { kind: 'assign'; signal: 'rst' | 'en'; value: number; line: number }
  | { kind: 'assert'; expected: number; severity: string; message: string; line: number }
  | { kind: 'report'; severity: string; message: string; line: number }
  | { kind: 'unsupported'; text: string; line: number };

export function parseStimulus(tbSource: string, clkPeriodNs: number): Stmt[] {
  const lines = tbSource.split('\n');
  const startIdx = lines.findIndex((l) => /^\s*(\w+\s*:\s*)?process\s*$/i.test(stripCommentsAndStrings(l)) || /^\s*stimulus\s*:\s*process/i.test(l));
  if (startIdx < 0) return [];
  const beginIdx = lines.findIndex((l, i) => i > startIdx && /^\s*begin\s*$/i.test(l));
  const endIdx = lines.findIndex((l, i) => i > beginIdx && /^\s*end\s+process/i.test(l));
  if (beginIdx < 0 || endIdx < 0) return [];

  // join statements (they may span lines, e.g. assert ... report ... severity ...;)
  const stmts: Stmt[] = [];
  let buf = '';
  let bufLine = 0;
  for (let i = beginIdx + 1; i < endIdx; i++) {
    const raw = lines[i].replace(/--.*$/, '').trim();
    if (!raw) continue;
    if (!buf) bufLine = i + 1;
    buf += (buf ? ' ' : '') + raw;
    if (!raw.endsWith(';')) continue;
    stmts.push(parseStmt(buf, bufLine, clkPeriodNs));
    buf = '';
  }
  return stmts;
}

function evalTime(expr: string, clk: number): number | undefined {
  const e = expr.trim();
  let m = /^(\d+)\s*\*\s*CLK_PERIOD$/i.exec(e);
  if (m) return parseInt(m[1], 10) * clk;
  m = /^CLK_PERIOD\s*\*\s*(\d+)$/i.exec(e);
  if (m) return parseInt(m[1], 10) * clk;
  if (/^CLK_PERIOD$/i.test(e)) return clk;
  m = /^CLK_PERIOD\s*\/\s*(\d+)$/i.exec(e);
  if (m) return clk / parseInt(m[1], 10);
  return parseTimeNs(e);
}

function parseStmt(s: string, line: number, clk: number): Stmt {
  let m: RegExpExecArray | null;
  if (/^wait\s*;$/i.test(s)) return { kind: 'waitForever', line };
  if ((m = /^wait\s+for\s+(.+);$/i.exec(s))) {
    const ns = evalTime(m[1], clk);
    return ns === undefined ? { kind: 'unsupported', text: s, line } : { kind: 'wait', ns, line };
  }
  if ((m = /^(rst|en)\s*<=\s*'([01])'\s*;$/i.exec(s))) return { kind: 'assign', signal: m[1].toLowerCase() as 'rst' | 'en', value: parseInt(m[2], 10), line };
  if ((m = /^assert\s+unsigned\s*\(\s*count\s*\)\s*=\s*(\d+)\s*(?:report\s+"([^"]*)")?\s*(?:severity\s+(\w+))?\s*;$/i.exec(s)))
    return { kind: 'assert', expected: parseInt(m[1], 10), message: m[2] ?? 'Assertion violation.', severity: (m[3] ?? 'error').toLowerCase(), line };
  if ((m = /^report\s+"([^"]*)"\s*(?:severity\s+(\w+))?\s*;$/i.exec(s))) return { kind: 'report', message: m[1], severity: (m[2] ?? 'note').toLowerCase(), line };
  return { kind: 'unsupported', text: s, line };
}

interface SimOutput {
  vcd?: string;
  reports: NonNullable<import('../contracts/hdlService').JobResultInfo['reports']>;
  failure?: { message: string; time: number; line: number };
  logs: string[];
  endTime: number;
}

export function simulate(req: JobRequest, model: Model): SimOutput {
  const tb = req.files.find((f) => new RegExp(`entity\\s+${req.top}\\s+is`, 'i').test(f.content))!;
  const stopNs = parseTimeNs(req.options.stopTime) ?? 200;
  const stmts = parseStimulus(tb.content, model.clkPeriodNs);
  const half = model.clkPeriodNs / 2;
  const mod = 2 ** model.width;

  let rst = 1;
  let en = 0;
  let count = 0;
  let t = 0;
  const changes: VcdChange[] = [];
  const reports: SimOutput['reports'] = [];
  const logs: string[] = [];
  let failure: SimOutput['failure'];

  // advance the clocked model from time `t` to `until`, recording changes
  let clk = 0;
  let nextEdge = half;
  const advance = (until: number) => {
    while (nextEdge <= until && nextEdge <= stopNs) {
      clk = clk ^ 1;
      changes.push({ time: nextEdge, id: 'c', value: clk });
      if (clk === 1) {
        const before = count;
        if (rst === 1) count = 0;
        else if (en === 1) count = (count + 1) % mod;
        if (count !== before) {
          changes.push({ time: nextEdge, id: 'q', value: count });
          changes.push({ time: nextEdge, id: 'r', value: count });
        }
      }
      nextEdge += half;
    }
    t = Math.min(until, stopNs);
  };

  for (const s of stmts) {
    if (t > stopNs || failure) break;
    switch (s.kind) {
      case 'wait':
        advance(t + s.ns);
        break;
      case 'waitForever':
        advance(stopNs);
        break;
      case 'assign':
        if (s.signal === 'rst') rst = s.value;
        else en = s.value;
        changes.push({ time: t, id: s.signal === 'rst' ? 'x' : 'e', value: s.value });
        break;
      case 'assert':
        if (count !== s.expected % mod) {
          const msg = `${tb.path}:${s.line}:5:@${fmtNs(t)}:(assertion ${s.severity}): ${s.message}`;
          reports.push({ severity: s.severity as 'error', message: s.message, time: fmtNs(t) });
          logs.push(msg);
          if (s.severity === 'failure') failure = { message: s.message, time: t, line: s.line };
        }
        break;
      case 'report':
        reports.push({ severity: s.severity as 'note', message: s.message, time: fmtNs(t) });
        logs.push(`${tb.path}:${s.line}:5:@${fmtNs(t)}:(report ${s.severity}): ${s.message}`);
        if (s.severity === 'failure') failure = { message: s.message, time: t, line: s.line };
        break;
      case 'unsupported':
        logs.push(`simulator: statement at ${tb.path}:${s.line} is outside the prescribed testbench pattern and was skipped`);
        break;
    }
  }
  if (!failure) advance(stopNs);
  const endTime = failure ? failure.time : stopNs;

  let vcd: string | undefined;
  if (req.options.waveform === 'vcd') {
    const top = req.top.toLowerCase();
    const signals: VcdSignal[] = [
      { id: 'c', name: 'clk', width: 1, scope: top },
      { id: 'x', name: 'rst', width: 1, scope: top },
      { id: 'e', name: 'en', width: 1, scope: top },
      { id: 'q', name: 'count', width: model.width, scope: top },
      { id: 'r', name: 'count_r', width: model.width, scope: `${top}.dut` },
    ];
    vcd = writeVcd({
      date: new Date(0).toUTCString(),
      timescale: '1ns',
      signals,
      initial: { c: 0, x: 1, e: 0, q: 0, r: 0 },
      changes: changes.filter((c) => c.time <= endTime),
      endTime: Math.round(endTime),
    });
  }
  return { vcd, reports, failure, logs, endTime };
}

// ------------------------------------------------------------------ driver

function log(stage: LogEntry['stage'], text: string, stream: LogEntry['stream'] = 'stdout'): LogEntry {
  return { stage, stream, text };
}

function diagText(d: ToolDiagnostic): string {
  const loc = d.file ? `${d.file}${d.line ? `:${d.line}` : ''}${d.column ? `:${d.column}` : ''}: ` : '';
  return `${loc}${d.severity === 'error' ? '' : `${d.severity}: `}${d.message}`;
}

/** Runs a job request through the simulated GHDL pipeline. Deterministic. */
export function runJob(req: JobRequest): EngineOutcome {
  const started = Date.now();
  const steps: EngineStep[] = [];
  const allLogs: LogEntry[] = [];
  const fail = (stage: JobStage, failure: JobFailure): EngineOutcome => ({
    steps,
    result: {
      contractVersion: HDL_CONTRACT_VERSION,
      status: 'failed',
      stage,
      failure,
      logs: allLogs,
      artefacts: [],
      result: { exitCode: 1, durationMs: Date.now() - started, summary: failure.message },
    },
  });
  const push = (stage: JobStage, logs: LogEntry[]) => {
    steps.push({ stage, logs });
    allLogs.push(...logs);
  };

  // service-level validation (request shape and resource limits)
  const stopNs = parseTimeNs(req.options?.stopTime ?? '');
  const serviceProblems: string[] = [];
  if (req.contractVersion !== HDL_CONTRACT_VERSION) serviceProblems.push(`unsupported contractVersion "${req.contractVersion}"`);
  if (!Array.isArray(req.files) || req.files.length === 0) serviceProblems.push('request contains no source files');
  if (stopNs === undefined) serviceProblems.push(`invalid stopTime "${req.options?.stopTime}"`);
  else if (stopNs > MAX_SIM_TIME_NS)
    serviceProblems.push(`job exceeded the service resource limit: requested ${req.options.stopTime}, maximum simulated time is 1 ms. The job was terminated.`);
  if (serviceProblems.length) {
    push('queued', serviceProblems.map((p) => log('service', `hdl-service: ${p}`, 'stderr')));
    return fail('queued', { category: 'service', message: serviceProblems[0], diagnostics: [] });
  }

  // analysis
  const aLogs = req.files.map((f) => log('analysis', `ghdl -a --std=${req.options.vhdlStandard} ${f.path}`));
  const aDiags = analyse(req.files);
  aLogs.push(...aDiags.map((d) => log('analysis', diagText(d), 'stderr')));
  if (aDiags.length) aLogs.push(log('analysis', 'ghdl: compilation error', 'stderr'));
  push('analysis', aLogs);
  if (aDiags.some((d) => d.severity === 'error'))
    return fail('analysis', { category: 'analysis', message: `Analysis failed with ${aDiags.length} error(s)`, diagnostics: aDiags });

  // elaboration
  const eLogs = [log('elaboration', `ghdl -e --std=${req.options.vhdlStandard} ${req.top}`)];
  const { diags: eDiags, model } = elaborate(req);
  eLogs.push(...eDiags.map((d) => log('elaboration', `ghdl:error: ${diagText(d)}`, 'stderr')));
  push('elaboration', eLogs);
  if (!model) return fail('elaboration', { category: 'elaboration', message: eDiags[0]?.message ?? 'Elaboration failed', diagnostics: eDiags });

  // simulation
  const sLogs = [log('simulation', `ghdl -r --std=${req.options.vhdlStandard} ${req.top} --stop-time=${req.options.stopTime}${req.options.waveform === 'vcd' ? ` --vcd=${req.top}.vcd` : ''}`)];
  const sim = simulate(req, model);
  sLogs.push(...sim.logs.map((l) => log('simulation', l, /assertion|failure/.test(l) ? 'stderr' : 'stdout')));
  if (sim.failure) {
    sLogs.push(log('simulation', `ghdl:error: simulation failed at ${fmtNs(sim.failure.time)}`, 'stderr'));
    push('simulation', sLogs);
    const tb = req.files.find((f) => f.role === 'testbench');
    return fail('simulation', {
      category: 'simulation',
      message: `Simulation stopped at ${fmtNs(sim.failure.time)}: ${sim.failure.message}`,
      diagnostics: [{ file: tb?.path, line: sim.failure.line, severity: 'error', message: `assertion failure: ${sim.failure.message}` }],
    });
  }
  sLogs.push(log('simulation', `ghdl:info: simulation stopped by --stop-time @${fmtNs(sim.endTime)}`));
  push('simulation', sLogs);

  const artefacts: Artefact[] = [];
  if (sim.vcd) artefacts.push({ kind: 'vcd', name: `${req.top}.vcd`, content: sim.vcd, sizeBytes: sim.vcd.length });
  const errors = sim.reports.filter((r) => r.severity === 'error').length;
  push('completed', [log('simulation', `job completed: ${artefacts.length ? `waveform ${req.top}.vcd written` : 'no waveform requested'}`)]);

  return {
    steps,
    result: {
      contractVersion: HDL_CONTRACT_VERSION,
      status: 'succeeded',
      stage: 'completed',
      logs: allLogs,
      artefacts,
      result: {
        exitCode: 0,
        durationMs: Date.now() - started,
        simulatedTime: fmtNs(sim.endTime),
        summary: errors
          ? `Simulation completed to ${fmtNs(sim.endTime)} with ${errors} assertion error(s) reported`
          : `Simulation completed to ${fmtNs(sim.endTime)}`,
        reports: sim.reports,
      },
    },
  };
}
