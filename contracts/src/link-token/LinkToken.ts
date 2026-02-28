import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    Calldata,
    OP20,
    OP20InitParameters,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';

const ONE_TOKEN: u256 = u256.from(1_000_000_000_000_000_000); // 10^18
const MAX_SUPPLY: u256 = SafeMath.mul(u256.from(1_000_000), ONE_TOKEN); // 1M * 10^18

export class LinkToken extends OP20 {
    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);

        this.instantiate(
            new OP20InitParameters(MAX_SUPPLY, 18, 'Link Token', 'LINK'),
        );

        this._mint(Blockchain.tx.sender, this._maxSupply.value);
    }

    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }
}
