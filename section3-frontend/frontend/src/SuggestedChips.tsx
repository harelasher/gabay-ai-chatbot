interface Props {
  onChipClick: (question: string) => void;
  chips?: string[]; // if provided, overrides the static defaults
}

const DEFAULT_CHIPS = [
  'אילו פרויקטים זמינים?',
  'מה זה פינוי בינוי?',
  'כיצד ליצור קשר עם גבאי?',
  'מה זה תמ"א 38?',
];

export default function SuggestedChips({ onChipClick, chips }: Props) {
  const displayed = chips && chips.length > 0 ? chips : DEFAULT_CHIPS;

  return (
    <div className="chips" dir="rtl">
      {displayed.map(chip => (
        <button
          key={chip}
          className="chip"
          type="button"
          onClick={() => onChipClick(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
