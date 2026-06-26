import { Icon } from "../../components/Icon";

type Props = {
  value: string;
  ariaLabel: string;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function TeamverDriveSearchField({
  value,
  ariaLabel,
  placeholder,
  disabled = false,
  autoFocus = false,
  onChange,
  onSubmit,
}: Props) {
  return (
    <div className="teamver-drive-picker-search">
      <Icon name="search" size={14} />
      <input
        autoFocus={autoFocus}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            onSubmit();
          }
        }}
      />
      <button
        type="button"
        className="teamver-drive-picker-search-submit"
        aria-label="검색"
        disabled={disabled}
        onClick={onSubmit}
      >
        <Icon name="search" size={14} />
      </button>
    </div>
  );
}
