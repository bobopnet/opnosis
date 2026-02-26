# OPNosis — Privacy Policy

**Last Updated: February 26, 2026**

This Privacy Policy describes how the OPNosis Interface ("Interface", "Service") handles information when you use the web-based frontend to interact with the OPNosis batch auction protocol on Bitcoin Layer 1 via OP_NET.

---

## 1. Our Approach to Privacy

OPNosis is designed to minimize data collection. The Interface is a static web application that communicates directly with the OP_NET blockchain and a read-only backend indexer. We do not require account creation, email addresses, or personal identification to use the Service.

## 2. Information We Do NOT Collect

The Interface does **not** collect, store, or process:

- Names, email addresses, or other personally identifiable information.
- Private keys, seed phrases, or wallet passwords.
- IP addresses on the backend (the backend API does not log request metadata).
- Cookies for tracking or advertising purposes.
- Data through third-party analytics or tracking services.

## 3. Information Visible on the Blockchain

When you interact with the OPNosis smart contract through the Interface (or by any other means), certain information is recorded on the Bitcoin blockchain and the OP_NET network. This includes:

- **Wallet addresses** — Your public wallet address is recorded with every on-chain transaction you initiate, including auction creation, bid placement, settlement, and claims.
- **Transaction details** — Bid amounts, order parameters, and auction interactions are recorded permanently on-chain.
- **Timestamps** — The time of each transaction is recorded in the block data.

**This on-chain data is public, permanent, and immutable.** It cannot be modified, deleted, or made private after submission. This is an inherent property of blockchain technology, not a choice made by the Interface. You should not interact with the protocol if you are not comfortable with this level of transparency.

## 4. Backend Indexer Data

The OPNosis backend server indexes publicly available on-chain auction data to provide a faster browsing experience. Specifically, the backend:

- Reads auction data, order counts, and settlement status from the OP_NET blockchain via a JSON-RPC provider.
- Caches this public blockchain data temporarily in memory to reduce redundant RPC calls.
- Serves this data to the Interface through a REST API.

The backend **does not** store user-specific data, session information, or request logs. The indexed data consists entirely of information that is already publicly available on the blockchain.

## 5. Wallet Connection

When you connect your OP_WALLET to the Interface:

- The Interface receives your public wallet address and network information from the wallet extension.
- This information is held in browser memory only for the duration of your session.
- No wallet data is transmitted to or stored on the backend server.
- Disconnecting your wallet or closing the browser tab clears this data from memory.

## 6. Local Storage

The Interface may use your browser's local storage to persist non-sensitive preferences (such as selected network). This data:

- Is stored entirely on your device.
- Is never transmitted to any server.
- Can be cleared at any time through your browser settings.

## 7. Third-Party Services

### 7.1 OP_NET RPC Providers

The Interface communicates with OP_NET JSON-RPC endpoints (e.g., `https://testnet.opnet.org`, `https://mainnet.opnet.org`) to read blockchain data. These providers may have their own privacy policies governing how they handle RPC requests. We encourage you to review the privacy practices of OP_NET.

### 7.2 OP_WALLET Extension

Wallet interactions are handled by the OP_WALLET browser extension, which operates independently. The Interface does not control or have insight into data the wallet extension may collect. Refer to the OP_WALLET privacy documentation for details.

### 7.3 Hosting Provider

The Interface is served as static files from a hosting provider. The hosting provider may collect standard server logs (IP addresses, request timestamps, user agents) as part of its infrastructure. This is outside our control. If privacy from the hosting layer is a concern, you may access the Interface through a VPN or interact with the smart contract directly.

## 8. Data Retention

- **On-chain data**: Permanent and immutable. Cannot be deleted.
- **Backend cache**: Temporary in-memory cache that is cleared periodically and on server restart. No persistent storage of user data.
- **Browser session data**: Cleared when you disconnect your wallet or close the browser tab.
- **Local storage**: Persists until you clear it through your browser settings.

## 9. Security

We take reasonable measures to secure the Interface and backend:

- The Interface does not handle private keys or sensitive credentials.
- The backend does not store personal data or maintain user sessions.
- All communication between the Interface and backend uses standard web protocols.
- Smart contract interactions require explicit wallet approval for every transaction.

However, no system is perfectly secure. You are responsible for securing your own devices, wallet, and private keys.

## 10. Children's Privacy

The Service is not directed at individuals under the age of 18. We do not knowingly collect information from children. If you are under 18, do not use the Service.

## 11. International Users

The OPNosis protocol and Interface are accessible globally. By using the Service, you acknowledge that blockchain data is stored on a decentralized network without geographic boundaries. There is no central server location, and on-chain data is replicated across all network nodes worldwide.

## 12. Your Rights

Depending on your jurisdiction, you may have certain rights regarding personal data. However, due to the decentralized and non-custodial nature of the Service:

- **On-chain data cannot be deleted or modified** — this is a technical limitation of blockchain technology, not a policy choice.
- **We cannot identify you** — the Interface does not link wallet addresses to real-world identities. We have no means to respond to data subject access requests because we do not hold personal data.
- **You control your data** — you choose what transactions to make and what information to put on-chain. You can stop using the Service at any time.

If you believe we hold any personal data about you in error, please contact us and we will investigate.

## 13. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be indicated by updating the "Last Updated" date at the top. Your continued use of the Service after any changes constitutes acceptance of the updated policy.

## 14. Contact

For questions about this Privacy Policy, you may open an issue on the OPNosis project repository or contact the development team through the channels listed in the project documentation.
