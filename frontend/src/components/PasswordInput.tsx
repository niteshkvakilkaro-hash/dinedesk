import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

/** A password field with a show / hide button (sign-up, sign-in, My account). */
// forwardRef: react-hook-form's register() attaches a ref to read the value.
export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} ref={ref} type={show ? 'text' : 'password'} className="field-input pr-12" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-ink/5" aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
        {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
});
