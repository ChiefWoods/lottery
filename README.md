# Lottery

Ticket lottery for [Solana Development Bootcamp](https://github.com/solana-developers/developer-bootcamp-2024).

[Source Repository](https://github.com/ChiefWoods/lottery)

## Built With

### Languages

- [![Rust](https://img.shields.io/badge/Rust-f75008?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
- [![TypeScript](https://img.shields.io/badge/TypeScript-ffffff?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

### Libraries

- [@coral-xyz/anchor](https://www.anchor-lang.com/)
- [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/)
- [@solana/spl-token](https://solana-labs.github.io/solana-program-library/token/js/)
- [@metaplex-foundation/umi](https://developers.metaplex.com/umi)
- [@metaplex-foundation/mpl-token-metadata](https://developers.metaplex.com/token-metadata)
- [@switchboard-xyz/on-demand](https://docs.switchboard.xyz/)

### Crates

- [anchor-lang](https://docs.rs/anchor-lang/latest/anchor_lang/)
- [anchor-spl](https://docs.rs/anchor-spl/latest/anchor_spl/)
- [switchboard-on-demand](https://docs.rs/switchboard-on-demand/latest/switchboard_on_demand/)

### Test Runner

- [![Bun](https://img.shields.io/badge/Bun-000?style=for-the-badge&logo=bun)](https://bun.sh/)

## Getting Started

### Prerequisites

1. Update your Solana CLI, Bun toolkit and avm

```bash
agave-install init 2.1.20
bun upgrade
avm init 0.31.1
```

### Setup

1. Clone the repository

```bash
git clone https://github.com/ChiefWoods/lottery.git
```

2. Install all dependencies

```bash
bun i
```

3. Resync your program id

```bash
anchor keys sync
```

4. Build the program

```bash
anchor build
```

#### Deployment

1. Deploy the program

```bash
anchor deploy --provider.cluster d
```

2. Optionally initialize IDL

```bash
anchor idl init -f target/idl/lottery.json <PROGRAM_ID> --provider.cluster d
```

#### Testing

1. Set up `.env` values. Use a wallet that's funded in devnet with at least 1 SOL. This wallet is used to fund keypairs when running a new test suite.

```bash
cp .env.example .env
```

2. Run all `.test.ts` files under `/tests`. A max buffer of 2 mins is allowed for the tests to run due to the asynchronous state of devnet testing.

```bash
bun run test
```

## Issues

View the [open issues](https://github.com/ChiefWoods/lottery/issues) for a full list of proposed features and known bugs.

## Acknowledgements

### Resources

- [Shields.io](https://shields.io/)

## Contact

[chii.yuen@hotmail.com](mailto:chii.yuen@hotmail.com)
