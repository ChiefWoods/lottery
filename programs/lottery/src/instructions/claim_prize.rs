use anchor_lang::prelude::*;
use anchor_spl::{
    metadata::{Metadata, MetadataAccount},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{error::LotteryError, Lottery, LOTTERY_SEED, METADATA_SEED, TICKET_MINT_SEED};

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    #[account(
        mut,
        seeds = [LOTTERY_SEED, lottery.collection_mint.key().as_ref()],
        bump = lottery.bump,
        has_one = collection_mint,
    )]
    pub lottery: Account<'info, Lottery>,
    #[account(
        mint::token_program = token_program,
        seeds = [TICKET_MINT_SEED, lottery.winning_index.to_le_bytes().as_ref()],
        bump,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::token_program = token_program)]
    pub collection_mint: InterfaceAccount<'info, Mint>,
    #[account(
        associated_token::mint = ticket_mint,
        associated_token::authority = winner,
        associated_token::token_program = token_program,
    )]
    pub ticket_mint_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), ticket_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata: Account<'info, MetadataAccount>,
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub collection_metadata: Account<'info, MetadataAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
}

impl ClaimPrize<'_> {
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        require!(
            ctx.accounts.lottery.winner_chosen,
            LotteryError::WinnerNotChosen
        );

        require_eq!(
            ctx.accounts.ticket_mint_ata.amount,
            1,
            LotteryError::InvalidTicket
        );

        require!(
            ctx.accounts.metadata.collection.as_ref().unwrap().verified,
            LotteryError::TicketNotVerified
        );

        require!(
            ctx.accounts.metadata.collection.as_ref().unwrap().key
                == ctx.accounts.collection_mint.key(),
            LotteryError::InvalidTicket
        );

        let metadata_name = ctx.accounts.metadata.name.replace("\u{0}", "");

        let winner_ticket_number = metadata_name
            .split('#')
            .nth(1)
            .ok_or(LotteryError::InvalidTicket)?
            .parse::<u64>()
            .map_err(|_| LotteryError::InvalidTicket)?;

        require!(
            winner_ticket_number == ctx.accounts.lottery.winning_index,
            LotteryError::InvalidTicket
        );

        **ctx
            .accounts
            .lottery
            .to_account_info()
            .try_borrow_mut_lamports()? -= ctx.accounts.lottery.pot_amount;

        **ctx.accounts.winner.try_borrow_mut_lamports()? += ctx.accounts.lottery.pot_amount;

        ctx.accounts.lottery.pot_amount = 0;

        Ok(())
    }
}
