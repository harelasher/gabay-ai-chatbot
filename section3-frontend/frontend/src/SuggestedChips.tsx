interface Props {
  onChipClick: (question: string) => void;
}

const CHIPS = [
  'אילו פרויקטים זמינים?',
  'מה זה פינוי בינוי?',
  'כיצד ליצור קשר עם גבאי?',
  'מה זה תמ"א 38?',
];

export default function SuggestedChips({ onChipClick }: Props) {
  return (
    <div className="chips" dir="rtl">
      {CHIPS.map(chip => (
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
