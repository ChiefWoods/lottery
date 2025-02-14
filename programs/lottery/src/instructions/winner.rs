use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use switchboard_on_demand::RandomnessAccountData;

use crate::{error::LotteryError, Lottery, LOTTERY_SEED};

#[derive(Accounts)]
pub struct Winner<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [LOTTERY_SEED, lottery.collection_mint.key().as_ref()],
        bump = lottery.bump,
        has_one = authority,
        has_one = collection_mint,
    )]
    pub lottery: Account<'info, Lottery>,
    #[account(mint::token_program = token_program)]
    pub collection_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: The account's data is validated manually within the handler.
    pub randomness_account_data: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl Winner<'_> {
    pub fn commit_winner(ctx: Context<Winner>) -> Result<()> {
        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .unwrap();

        let clock = Clock::get()?;

        require_eq!(
            randomness_data.seed_slot,
            clock.slot - 1,
            LotteryError::RandomnessAlreadyRevealed
        );

        ctx.accounts.lottery.randomness_account_data = ctx.accounts.randomness_account_data.key();

        Ok(())
    }

    pub fn choose_winner(ctx: Context<Winner>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.lottery.randomness_account_data.key(),
            ctx.accounts.randomness_account_data.key(),
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

        let randomness_data =
            RandomnessAccountData::parse(ctx.accounts.randomness_account_data.data.borrow())
                .unwrap();

        let revealed_random_value = randomness_data
            .get_value(&clock)
            .map_err(|_| LotteryError::RandomnessNotResolved)?;

        let randomness_result = revealed_random_value[0] as u64 % ctx.accounts.lottery.index;

        ctx.accounts.lottery.winning_index = randomness_result;
        ctx.accounts.lottery.winner_chosen = true;

        Ok(())
    }
}
