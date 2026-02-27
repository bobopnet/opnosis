import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    Calldata,
    OP20,
    OP20InitParameters,
} from '@btc-vision/btc-runtime/runtime';

const MAX_SUPPLY: u256 = u256.from(2_100_000_000_000_000); // 21M * 10^8

export class OrangeCoin extends OP20 {
    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);

        this.instantiate(
            new OP20InitParameters(MAX_SUPPLY, 8, 'Orange Coin', 'ORNGE'),
        );

        this._mint(Blockchain.tx.sender, this._maxSupply.value);
    }

    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }
}
