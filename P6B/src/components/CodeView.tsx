/**
 * Shows the current VHDL file with line numbers and colours, like VHDLive's editor area.
 *
 * Important: this is NOT the P6A editor. With the fixture workspace (test double)
 * a plain <textarea> sits on top of the coloured text so testers can change the
 * source, just like P6A would publish an edit. There are no live diagnostics or
 * completion here: those belong to P6A (Monaco + LSP).
 */
import { useEffect, useRef } from 'react';
import { tokenizeLine } from '../lib/vhdl';

interface Props {
  path: string;
  content: string;
  editable: boolean;
  onChange: (text: string) => void;
  highlightLine?: number; // line to mark after clicking a problem
}

const LINE_HEIGHT = 18; // must match .code line-height in styles.css

export function CodeView({ path, content, editable, onChange, highlightLine }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const lines = content.split('\n');

  // Scroll the marked line into view.
  useEffect(() => {
    if (highlightLine && scroller.current) {
      scroller.current.scrollTop = Math.max(0, (highlightLine - 5) * LINE_HEIGHT);
    }
  }, [highlightLine, path]);

  return (
    <div className="code-scroll" ref={scroller}>
      <div className="code">
        <div className="gutter" aria-hidden>
          {lines.map((_, i) => (
            <div key={i} className={i + 1 === highlightLine ? 'hl' : ''}>{i + 1}</div>
          ))}
        </div>
        <div className="code-area">
          <pre className="code-colours" aria-hidden>
            {lines.map((line, i) => (
              <div key={i} className={`code-line ${i + 1 === highlightLine ? 'hl' : ''}`}>
                {tokenizeLine(line).map((t, j) => (
                  <span key={j} className={`t-${t.kind}`}>{t.text}</span>
                ))}
                {'\n'}
              </div>
            ))}
          </pre>
          {editable ? (
            <textarea
              className="code-input"
              spellCheck={false}
              value={content}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`Source of ${path} (test double for P6A)`}
              data-testid="ws-source"
              style={{ height: lines.length * LINE_HEIGHT + 40 }}
            />
          ) : (
            <div className="sr-only" data-testid="ws-source">{content}</div>
          )}
        </div>
      </div>
    </div>
  );
}
