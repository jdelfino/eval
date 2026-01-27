package db

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// TxFunc is a function that executes within a transaction.
// Return nil to commit, return an error to rollback.
type TxFunc func(tx pgx.Tx) error

// txBeginner is an interface for starting transactions.
// This allows for mocking in tests.
type txBeginner interface {
	BeginTx(ctx context.Context, txOptions pgx.TxOptions) (pgx.Tx, error)
}

// WithTx executes fn within a transaction using default options.
// On success (nil return), the transaction is committed.
// On error or panic, the transaction is rolled back.
func (p *Pool) WithTx(ctx context.Context, fn TxFunc) error {
	return withTxImpl(ctx, p.Pool, fn)
}

// WithTxOptions executes fn within a transaction with custom options.
// This allows specifying isolation level, access mode, and deferrable status.
// On success (nil return), the transaction is committed.
// On error or panic, the transaction is rolled back.
func (p *Pool) WithTxOptions(ctx context.Context, opts pgx.TxOptions, fn TxFunc) error {
	return withTxOptionsImpl(ctx, p.Pool, opts, fn)
}

// withTxImpl is the internal implementation that works with the txBeginner interface.
func withTxImpl(ctx context.Context, pool txBeginner, fn TxFunc) error {
	return withTxOptionsImpl(ctx, pool, pgx.TxOptions{}, fn)
}

// withTxOptionsImpl is the internal implementation with custom options.
func withTxOptionsImpl(ctx context.Context, pool txBeginner, opts pgx.TxOptions, fn TxFunc) error {
	tx, err := pool.BeginTx(ctx, opts)
	if err != nil {
		return err
	}

	defer func() {
		if r := recover(); r != nil {
			// Rollback on panic, ignore error since we're re-panicking
			_ = tx.Rollback(ctx)
			panic(r)
		}
	}()

	if err := fn(tx); err != nil {
		// Rollback on error, ignore rollback error since fn error is more important
		_ = tx.Rollback(ctx)
		return err
	}

	return tx.Commit(ctx)
}
