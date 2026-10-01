import { useState, useCallback, type ReactNode } from 'react';
import { Delete } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './CalculatorWidget.module.scss';

const MAX_DIGITS = 9;

function evaluate(a: string, op: string, b: string): string {
  const n1 = parseFloat(a);
  const n2 = parseFloat(b);
  let result: number;
  switch (op) {
    case '+': result = n1 + n2; break;
    case '-': result = n1 - n2; break;
    case 'x': result = n1 * n2; break;
    case '/': return n2 === 0 ? 'Error' : formatResult(n1 / n2);
    default: return b;
  }
  return formatResult(result);
}

function formatResult(n: number): string {
  const s = String(n);
  if (s.length <= MAX_DIGITS) return s;
  // Try fixed precision, trimming trailing zeros
  for (let d = MAX_DIGITS - 2; d >= 0; d--) {
    const fixed = n.toFixed(d);
    if (fixed.length <= MAX_DIGITS) return fixed;
  }
  // Fall back to exponential
  const exp = n.toPrecision(4);
  return exp.length <= MAX_DIGITS ? exp : exp.slice(0, MAX_DIGITS);
}

// Calculator is 4x4 only, so no size variants needed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match WidgetProps for the registry
export function CalculatorWidget(_props: WidgetProps) {
  const { t } = useTranslation();
  const [operand, setOperand] = useState('0');
  const [operator, setOperator] = useState<string | null>(null);
  const [secondOperand, setSecondOperand] = useState('');
  const [didEvaluate, setDidEvaluate] = useState(false);

  const currentDisplay = secondOperand || operand;

  const inputDigit = useCallback((d: string) => {
    if (didEvaluate && !operator) {
      // Start fresh after evaluation
      setOperand(d);
      setDidEvaluate(false);
      return;
    }

    if (operator) {
      if (secondOperand.replace('-', '').replace('.', '').length >= MAX_DIGITS) return;
      setSecondOperand(prev => prev === '0' ? d : prev + d);
    } else {
      if (operand.replace('-', '').replace('.', '').length >= MAX_DIGITS) return;
      setOperand(prev => prev === '0' ? d : prev + d);
    }
    setDidEvaluate(false);
  }, [operator, operand, secondOperand, didEvaluate]);

  const inputDot = useCallback(() => {
    if (operator) {
      if (secondOperand.includes('.')) return;
      setSecondOperand(prev => prev === '' ? '0.' : prev + '.');
    } else {
      if (operand.includes('.')) return;
      setOperand(prev => prev + '.');
    }
  }, [operator, operand, secondOperand]);

  const chooseOperator = useCallback((op: string) => {
    if (operator && secondOperand) {
      // Chain evaluation
      const result = evaluate(operand, operator, secondOperand);
      setOperand(result);
      setSecondOperand('');
      setOperator(result === 'Error' ? null : op);
      setDidEvaluate(false);
      return;
    }
    setOperator(op);
    setSecondOperand('');
    setDidEvaluate(false);
  }, [operator, operand, secondOperand]);

  const doEquals = useCallback(() => {
    if (!operator || !secondOperand) return;
    const result = evaluate(operand, operator, secondOperand);
    setOperand(result);
    setOperator(null);
    setSecondOperand('');
    setDidEvaluate(true);
  }, [operator, operand, secondOperand]);

  const doClear = useCallback(() => {
    setOperand('0');
    setOperator(null);
    setSecondOperand('');
    setDidEvaluate(false);
  }, []);

  const doNegate = useCallback(() => {
    if (operator && secondOperand) {
      setSecondOperand(prev =>
        prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev
      );
    } else {
      setOperand(prev =>
        prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev
      );
    }
  }, [operator, secondOperand]);

  const doPercent = useCallback(() => {
    if (operator && secondOperand) {
      const val = parseFloat(secondOperand) / 100;
      setSecondOperand(formatResult(val));
    } else {
      const val = parseFloat(operand) / 100;
      setOperand(formatResult(val));
    }
  }, [operator, operand, secondOperand]);

  const doDelete = useCallback(() => {
    if (operator && secondOperand) {
      setSecondOperand(prev => prev.length <= 1 ? '' : prev.slice(0, -1));
    } else if (!operator) {
      setOperand(prev => prev.length <= 1 || (prev.length === 2 && prev.startsWith('-')) ? '0' : prev.slice(0, -1));
    }
  }, [operator, secondOperand]);

  // Truncate display to fit
  const displayText = currentDisplay.length > MAX_DIGITS
    ? currentDisplay.slice(0, MAX_DIGITS)
    : currentDisplay || '0';

  const buttons: Array<{ id: string; label: ReactNode; ariaLabel?: string; action: () => void; cls: string }> = [
    { id: 'AC',  label: 'AC', action: doClear,         cls: styles.btnClear },
    { id: '+/-', label: '±',  action: doNegate,        cls: styles.btnFunc },
    { id: '%',   label: '%',  action: doPercent,       cls: styles.btnFunc },
    { id: '/',   label: '÷',  action: () => chooseOperator('/'), cls: operator === '/' && !secondOperand ? styles.btnOpActive : styles.btnOp },
    { id: '7',   label: '7',  action: () => inputDigit('7'),     cls: styles.btnNum },
    { id: '8',   label: '8',  action: () => inputDigit('8'),     cls: styles.btnNum },
    { id: '9',   label: '9',  action: () => inputDigit('9'),     cls: styles.btnNum },
    { id: 'x',   label: '×',  action: () => chooseOperator('x'), cls: operator === 'x' && !secondOperand ? styles.btnOpActive : styles.btnOp },
    { id: '4',   label: '4',  action: () => inputDigit('4'),     cls: styles.btnNum },
    { id: '5',   label: '5',  action: () => inputDigit('5'),     cls: styles.btnNum },
    { id: '6',   label: '6',  action: () => inputDigit('6'),     cls: styles.btnNum },
    { id: '-',   label: '−',  action: () => chooseOperator('-'), cls: operator === '-' && !secondOperand ? styles.btnOpActive : styles.btnOp },
    { id: '1',   label: '1',  action: () => inputDigit('1'),     cls: styles.btnNum },
    { id: '2',   label: '2',  action: () => inputDigit('2'),     cls: styles.btnNum },
    { id: '3',   label: '3',  action: () => inputDigit('3'),     cls: styles.btnNum },
    { id: '+',   label: '+',  action: () => chooseOperator('+'), cls: operator === '+' && !secondOperand ? styles.btnOpActive : styles.btnOp },
    { id: '0',   label: '0',  action: () => inputDigit('0'),     cls: styles.btnNum },
    { id: '.',   label: '.',  action: inputDot,                  cls: styles.btnNum },
    { id: 'DEL', label: <Delete className={styles.btnIcon} aria-hidden />, ariaLabel: t('common.delete'), action: doDelete, cls: styles.btnFunc },
    { id: '=',   label: '=',  action: doEquals,                  cls: styles.btnEquals },
  ];

  return (
    <div className={styles.calculator}>
      <div className={styles.display}>
        <span className={styles.displayText}>{displayText}</span>
      </div>
      <div className={styles.grid}>
        {buttons.map(({ id, label, ariaLabel, action, cls }) => (
          <button
            key={id}
            type="button"
            className={cls}
            aria-label={ariaLabel}
            onClick={action}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default CalculatorWidget;
