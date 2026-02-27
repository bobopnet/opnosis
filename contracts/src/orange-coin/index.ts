import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { OrangeCoin } from './OrangeCoin';

// DO NOT add custom logic here.
Blockchain.contract = (): OrangeCoin => {
    return new OrangeCoin();
};

// REQUIRED: runtime exports
export * from '@btc-vision/btc-runtime/runtime/exports';

// REQUIRED: abort handler
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
