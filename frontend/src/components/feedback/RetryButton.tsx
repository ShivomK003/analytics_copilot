type RetryButtonProps = {
  label?: string;
  onRetry: () => void;
};

export function RetryButton({
  label = "Try again",
  onRetry,
}: RetryButtonProps) {
  return (
    <button className="button button-accent" type="button" onClick={onRetry}>
      {label}
    </button>
  );
}
