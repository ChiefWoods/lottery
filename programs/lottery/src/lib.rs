pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("3MPJNbDXavRtaUtXDSivASb3VbBWu3MTLF9UoAbUimyb");

#[program]
pub mod lottery {
    use super::*;

    pub fn initialize_lottery(
        ctx: Context<InitializeLottery>,
        args: InitializeLotteryArgs,
    ) -> Result<()> {
        InitializeLottery::initialize_lottery(ctx, args)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        BuyTicket::buy_ticket(ctx)
    }

    pub fn commit_winner(ctx: Context<Winner>) -> Result<()> {
        Winner::commit_winner(ctx)
    }

    pub fn choose_winner(ctx: Context<Winner>) -> Result<()> {
        Winner::choose_winner(ctx)
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        ClaimPrize::claim_prize(ctx)
    }
}
