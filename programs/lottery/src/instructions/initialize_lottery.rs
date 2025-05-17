use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        mpl_token_metadata::{
            instructions::{CreateV1CpiBuilder, VerifyCpiBuilder},
            types::{CollectionDetails, Creator, PrintSupply, VerificationArgs},
        },
        Metadata,
    },
    token_interface::{mint_to, Mint, MintTo, TokenAccount, TokenInterface},
};

use crate::{Lottery, COLLECTION_MINT_SEED, EDITION_SEED, LOTTERY_SEED, METADATA_SEED};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeLotteryArgs {
    pub start_time: i64,
    pub end_time: i64,
    pub price: u64,
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

#[derive(Accounts)]
#[instruction(args: InitializeLotteryArgs)]
pub struct InitializeLottery<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Lottery::DISCRIMINATOR.len() + Lottery::INIT_SPACE,
        seeds = [LOTTERY_SEED, collection_mint.key().as_ref()],
        bump,
    )]
    pub lottery: Account<'info, Lottery>,
    #[account(
        init,
        payer = authority,
        mint::authority = collection_mint,
        mint::decimals = 0,
        mint::freeze_authority = collection_mint,
        mint::token_program = token_program,
        seeds = [COLLECTION_MINT_SEED, authority.key().as_ref()],
        bump,
    )]
    pub collection_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = collection_mint,
        associated_token::authority = lottery,
        associated_token::token_program = token_program,
    )]
    pub collection_mint_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: initialized by Token Metadata program
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), collection_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: initialized by Token Metadata program
    #[account(
        mut,
        seeds = [METADATA_SEED, token_metadata_program.key().as_ref(), collection_mint.key().as_ref(), EDITION_SEED],
        bump,
        seeds::program = token_metadata_program.key()
    )]
    pub master_edition: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

impl InitializeLottery<'_> {
    pub fn initialize_lottery(
        ctx: Context<InitializeLottery>,
        args: InitializeLotteryArgs,
    ) -> Result<()> {
        let authority_key = ctx.accounts.authority.key();

        ctx.accounts.lottery.set_inner(Lottery {
            winner_chosen: false,
            bump: ctx.bumps.lottery,
            collection_mint_bump: ctx.bumps.collection_mint,
            start_time: args.start_time,
            end_time: args.end_time,
            index: 0,
            winning_index: 0,
            price: args.price,
            pot_amount: 0,
            authority: authority_key,
            randomness: Pubkey::default(),
            collection_mint: ctx.accounts.collection_mint.key(),
        });

        let signers_seeds: &[&[&[u8]]] = &[&[
            COLLECTION_MINT_SEED,
            authority_key.as_ref(),
            &[ctx.bumps.collection_mint],
        ]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    authority: ctx.accounts.collection_mint.to_account_info(),
                    mint: ctx.accounts.collection_mint.to_account_info(),
                    to: ctx.accounts.collection_mint_ata.to_account_info(),
                },
                signers_seeds,
            ),
            1,
        )?;

        CreateV1CpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .master_edition(Some(&ctx.accounts.master_edition.to_account_info()))
            .mint(&ctx.accounts.collection_mint.to_account_info(), true)
            .authority(&ctx.accounts.collection_mint.to_account_info())
            .payer(&ctx.accounts.authority.to_account_info())
            .update_authority(&ctx.accounts.collection_mint.to_account_info(), true)
            .system_program(&ctx.accounts.system_program.to_account_info())
            .sysvar_instructions(&ctx.accounts.rent.to_account_info())
            .spl_token_program(Some(&ctx.accounts.token_program.to_account_info()))
            .name(args.name)
            .symbol(args.symbol)
            .uri(args.uri)
            .seller_fee_basis_points(0)
            .creators(vec![Creator {
                address: ctx.accounts.authority.key(),
                verified: false,
                share: 100,
            }])
            .collection_details(CollectionDetails::V1 { size: 0 })
            .print_supply(PrintSupply::Zero)
            .invoke_signed(signers_seeds)?;

        VerifyCpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .authority(&ctx.accounts.authority.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .system_program(&ctx.accounts.system_program.to_account_info())
            .sysvar_instructions(&ctx.accounts.rent.to_account_info())
            .verification_args(VerificationArgs::CreatorV1)
            .invoke_signed(signers_seeds)?;

        Ok(())
    }
}
