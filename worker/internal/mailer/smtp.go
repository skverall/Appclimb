package mailer

import (
	"context"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
)

type SMTP struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

func (s SMTP) SendPasswordReset(
	ctx context.Context,
	to, resetURL string,
) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	from, err := mail.ParseAddress(s.From)
	if err != nil {
		return fmt.Errorf("invalid mail sender")
	}
	recipient, err := mail.ParseAddress(to)
	if err != nil || strings.ContainsAny(resetURL, "\r\n") {
		return fmt.Errorf("invalid password recovery message")
	}
	host := strings.TrimSpace(s.Host)
	if host == "" {
		return fmt.Errorf("mail transport unavailable")
	}
	addr := net.JoinHostPort(host, strings.TrimSpace(s.Port))
	auth := smtp.PlainAuth("", s.Username, s.Password, host)
	message := strings.Join([]string{
		"From: " + from.String(),
		"To: " + recipient.String(),
		"Subject: Reset your AppClimb password",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		"Use this secure link to choose a new AppClimb password:",
		resetURL,
		"",
		"This link expires in 30 minutes and works once.",
		"If you did not request it, you can ignore this email.",
	}, "\r\n")
	if err := smtp.SendMail(
		addr,
		auth,
		from.Address,
		[]string{recipient.Address},
		[]byte(message),
	); err != nil {
		return fmt.Errorf("send password reset: %w", err)
	}
	return nil
}
