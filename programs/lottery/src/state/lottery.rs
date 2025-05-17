use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Lottery {
    pub winner_chosen: bool,
    pub bump: u8,
    pub collection_mint_bump: u8,
    pub start_time: i64,
    pub end_time: i64,
    pub index: u64,
    pub winning_index: u64,
    pub price: u64,
    pub pot_amount: u64,
    pub authority: Pubkey,
    pub randomness: Pubkey,
    pub collection_mint: Pubkey,
}
