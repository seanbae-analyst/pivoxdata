# Ground truth — customers_messy.csv

A **hand-built dataset with a schema the scorer has never seen** (customers, not restaurant
inspections). The issues below were planted deliberately. The scorer is graded on whether it
catches exactly these — recall (did it find them) and precision (did it invent false ones).

16 rows. Planted issues = 10:

| # | Dimension | Column | code | Planted defect |
|---|---|---|---|---|
| 1 | completeness | notes | empty_column | `notes` is 100% empty |
| 2 | completeness | country | missing | 4/16 (25%) country values blank |
| 3 | completeness | age | missing | 4/16 (25%) age values blank |
| 4 | consistency | signup_date | mixed_date_format | ISO + US-slash + long all mixed in one column |
| 5 | consistency | signup_date | placeholder_date | two `1900-01-01` placeholder dates |
| 6 | consistency | age | numeric_text_mix | `age` mixes numbers with "thirty", "twenty" |
| 7 | consistency | (rows) | dup_rows | row 1005 is duplicated exactly |
| 8 | consistency | customer_id | dup_id | the duplicated row makes id `1005` appear twice in a 93.8%-unique key column |
| 9 | pii | email | pii | `email` column is real PII |
| 10 | pii | phone | pii | `phone` column is real PII |

Anything the scorer flags **beyond** these 10 is a false positive and lowers precision.
`full_name`, `country`, `customer_id` should NOT be flagged as PII.
