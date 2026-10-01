import { Pipe, type PipeTransform } from '@angular/core';
import { formatCop } from '../utils/money';

/** `{{ account.balanceMinor | cop }}` → "$ 25.000". */
@Pipe({ name: 'cop' })
export class CopPipe implements PipeTransform {
  transform(amountMinor: number | null | undefined): string {
    return amountMinor === null || amountMinor === undefined ? '' : formatCop(amountMinor);
  }
}
