use anchor_lang::prelude::*;

#[error_code]
pub enum LotteryError {
    #[msg("Lottery not started")]
    LotteryNotStarted,
    #[msg("Lottery ended")]
    LotteryHasEnded,
    #[msg("Lottery not ended")]
    LotteryNotEnded,
    #[msg("Winner already chosen")]
    WinnerAlreadyChosen,
    #[msg("Winner not chosen")]
    WinnerNotChosen,
    #[msg("Ticket not verified")]
    TicketNotVerified,
    #[msg("Invalid ticket")]
    InvalidTicket,
    #[msg("Invalid ticket format")]
    InvalidTicketFormat,
    #[msg("Incorrect randomness account")]
    IncorrectRandomnessAccount,
    #[msg("Randomness already revealed")]
    RandomnessAlreadyRevealed = 1000,
    #[msg("Randomness not resolved")]
    RandomnessNotResolved,
}
