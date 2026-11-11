type SkillSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

/** スキルを名前や説明で探す入力欄。 */
export function SkillSearch({ value, onChange }: SkillSearchProps) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 13,
        color: "var(--color-text-muted)",
        width: 320,
        maxWidth: "100%"
      }}
    >
      スキルを探す
      <input
        type="search"
        placeholder="名前や説明で探す"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 44,
          boxSizing: "border-box",
          padding: "0 14px",
          border: "1px solid var(--color-border-input)",
          borderRadius: 8,
          fontSize: 15,
          fontFamily: "inherit",
          color: "var(--color-text)",
          background: "var(--color-surface)"
        }}
      />
    </label>
  );
}
