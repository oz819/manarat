// The top of every screen: its name, one plain sentence saying what it is for, and (at most) the
// screen's one main button. "Each screen says what it does" — and has a single obvious action.
export default function ScreenHead({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="screen-head">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
