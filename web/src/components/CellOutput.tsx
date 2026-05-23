import { FunctionalComponent } from 'preact';

interface Props {
  outputs: string[];
  errors: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CellOutput: FunctionalComponent<Props> = ({ outputs, errors }) => {
  const empty = outputs.length === 0 && errors.length === 0;
  return (
    <div class="cell-outputs" data-testid="cell-output" id={`outputs-${outputs.length > 0 ? 'x' : 'empty'}`} style={empty ? 'display:none' : undefined}>
      {outputs.map((o, i) => (
        <div class="output-line" data-testid="cell-output-line" key={i}>
          {escapeHtml(o)}
        </div>
      ))}
      {errors.map((e, i) => (
        <div class="output-error" data-testid="cell-error" key={`e${i}`}>
          {escapeHtml(e)}
        </div>
      ))}
    </div>
  );
};

export default CellOutput;
