use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        mpl_token_metadata::{
            instructions::{CreateV1CpiBuilder, VerifyCpiBuilder},
            types::{Collection, PrintSupply, VerificationArgs},
        },
        MasterEditionAccount, Metadata, MetadataAccount,
    },
    token_interface::{mint_to, Mint, MintTo, TokenAccount, TokenInterface},
};

use crate::{
    error::LotteryError, Lottery, COLLECTION_MINT_SEED, EDITION_SEED, METADATA_SEED,
    TICKET_MINT_SEED,
};

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        has_one = collection_mint,
    )]
    pub lottery: Box<Account<'info, Lottery>>,
    #[account(
        init,
        payer = buyer,
        mint::authority = collection_mint,
        mint::decimals = 0,
        mint::freeze_authority = collection_mint,
        mint::token_program = token_program,
        seeds = [TICKET_MINT_SEED, lottery.key().as_ref(), lottery.index.to_le_bytes().as_ref()],
        bump,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub collection_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = buyer,
        associated_token::mint = ticket_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub ticket_mint_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: initialized by Token Metadata program
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), ticket_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: initialized by Token Metadata program
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), ticket_mint.key().as_ref(), EDITION_SEED],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub master_edition: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub collection_metadata: Box<Account<'info, MetadataAccount>>,
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), collection_mint.key().as_ref(), EDITION_SEED],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub collection_master_edition: Box<Account<'info, MasterEditionAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

impl BuyTicket<'_> {
    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        let clock = Clock::get()?;

        require_gte!(
            clock.unix_timestamp,
            ctx.accounts.lottery.start_time,
            LotteryError::LotteryNotStarted
        );

        require!(
            clock.unix_timestamp < ctx.accounts.lottery.end_time,
            LotteryError::LotteryHasEnded
        );

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.lottery.to_account_info(),
                },
            ),
            ctx.accounts.lottery.price,
        )?;

        ctx.accounts.lottery.pot_amount = ctx
            .accounts
            .lottery
            .pot_amount
            .checked_add(ctx.accounts.lottery.price)
            .unwrap();

        let ticket_name = format!(
            "{} #{}",
            ctx.accounts.collection_metadata.name.replace("\u{0}", ""),
            ctx.accounts.lottery.index
        );

        ctx.accounts.lottery.index += 1;

        let authority_key = ctx.accounts.lottery.authority.key();
        let signers_seeds: &[&[&[u8]]] = &[&[
            COLLECTION_MINT_SEED,
            authority_key.as_ref(),
            &[ctx.accounts.lottery.collection_mint_bump],
        ]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    authority: ctx.accounts.collection_mint.to_account_info(),
                    mint: ctx.accounts.ticket_mint.to_account_info(),
                    to: ctx.accounts.ticket_mint_ata.to_account_info(),
                },
                signers_seeds,
            ),
            1,
        )?;

        CreateV1CpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .master_edition(Some(&ctx.accounts.master_edition.to_account_info()))
            .mint(&ctx.accounts.ticket_mint.to_account_info(), false)
            .authority(&ctx.accounts.collection_mint.to_account_info())
            .payer(&ctx.accounts.buyer.to_account_info())
            .update_authority(&ctx.accounts.collection_mint.to_account_info(), true)
            .system_program(&ctx.accounts.system_program.to_account_info())
            .sysvar_instructions(&ctx.accounts.rent.to_account_info())
            .spl_token_program(Some(&ctx.accounts.token_program.to_account_info()))
            .name(ticket_name)
            .symbol(ctx.accounts.collection_metadata.symbol.clone())
            .uri(ctx.accounts.collection_metadata.uri.clone())
            .seller_fee_basis_points(0)
            .collection(Collection {
                verified: false,
                key: ctx.accounts.collection_mint.key(),
            })
            .print_supply(PrintSupply::Zero)
            .invoke_signed(signers_seeds)?;

        VerifyCpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .authority(&ctx.accounts.collection_mint.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .collection_mint(Some(&ctx.accounts.collection_mint.to_account_info()))
            .collection_metadata(Some(&ctx.accounts.collection_metadata.to_account_info()))
            .collection_master_edition(Some(
                &ctx.accounts.collection_master_edition.to_account_info(),
            ))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .sysvar_instructions(&ctx.accounts.rent.to_account_info())
            .verification_args(VerificationArgs::CollectionV1)
            .invoke_signed(signers_seeds)?;

        Ok(())
    }
}
