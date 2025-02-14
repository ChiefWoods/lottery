use anchor_lang::prelude::*;
use anchor_spl::metadata::mpl_token_metadata::accounts::{MasterEdition, Metadata};

#[constant]
pub const LOTTERY_SEED: &[u8] = b"lottery";
pub const COLLECTION_MINT_SEED: &[u8] = b"collection_mint";
pub const TICKET_MINT_SEED: &[u8] = b"ticket_mint";
pub const METADATA_SEED: &[u8] = Metadata::PREFIX;
pub const EDITION_SEED: &[u8] = MasterEdition::PREFIX.1;
