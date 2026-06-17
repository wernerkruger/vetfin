import pandas as pd

df = pd.read_csv('wowvets_clinics.csv')

# count number of rows with valid email addresses, and print the number of valid email addresses versus the total number of rows
valid_emails = df[df['email'].notna() & df['email'].str.contains('@')]
print(len(valid_emails))
print(len(df))
print(len(valid_emails) / len(df))
