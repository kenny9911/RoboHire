interface ButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export default function Button({ onClick, loading, disabled, children, variant = 'primary' }: ButtonProps) {
  const baseStyles = 'px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 w-full sm:w-auto';
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:bg-gray-100',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseStyles} ${variants[variant]}`}
    >
      {loading && (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
