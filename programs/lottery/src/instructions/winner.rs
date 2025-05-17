use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use switchboard_on_demand::RandomnessAccountData;

use crate::{error::LotteryError, Lottery};

#[derive(Accounts)]
pub struct Winner<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority,
        has_one = collection_mint,
    )]
    pub lottery: Account<'info, Lottery>,
    #[account(mint::token_program = token_program)]
    pub collection_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: The account's data is validated manually within the handler.
    pub randomness: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl Winner<'_> {
    pub fn commit_winner(ctx: Context<Winner>) -> Result<()> {
        let randomness =
            RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow()).unwrap();

        let clock = Clock::get()?;

        require_eq!(
            randomness.seed_slot,
            clock.slot - 1,
            LotteryError::RandomnessAlreadyRevealed
        );

        ctx.accounts.lottery.randomness = ctx.accounts.randomness.key();

        Ok(())
    }

    pub fn choose_winner(ctx: Context<Winner>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.lottery.randomness.key(),
            ctx.accounts.randomness.key(),
            LotteryError::IncorrectRandomnessAccount
        );

        let clock = Clock::get()?;

        require_gte!(
            clock.unix_timestamp,
            ctx.accounts.lottery.end_time,
            LotteryError::LotteryNotEnded
        );

        require!(
            !ctx.accounts.lottery.winner_chosen,
            LotteryError::WinnerAlreadyChosen
        );

        let randomness =
            RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow()).unwrap();

        let value = randomness
            .get_value(&clock)
            .map_err(|_| LotteryError::RandomnessNotResolved)?;

        let result = value[0] as u64 % ctx.accounts.lottery.index;

        ctx.accounts.lottery.winning_index = result;
        ctx.accounts.lottery.winner_chosen = true;

        Ok(())
    }
}
