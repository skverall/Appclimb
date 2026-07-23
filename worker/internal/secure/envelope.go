package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

type Envelope struct {
	Version          int    `json:"version"`
	EncryptedDataKey string `json:"encryptedDataKey"`
	DataKeyIV        string `json:"dataKeyIv"`
	DataKeyTag       string `json:"dataKeyTag"`
	Ciphertext       string `json:"ciphertext"`
	PayloadIV        string `json:"payloadIv"`
	PayloadTag       string `json:"payloadTag"`
}

func Seal(payload map[string]any, encodedMasterKey string) (Envelope, error) {
	masterKey, err := base64.StdEncoding.DecodeString(encodedMasterKey)
	if err != nil || len(masterKey) != 32 {
		return Envelope{}, errors.New("master key must be base64-encoded 32 bytes")
	}
	plaintext, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, fmt.Errorf("encode credential payload: %w", err)
	}
	dataKey := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dataKey); err != nil {
		return Envelope{}, fmt.Errorf("generate data key: %w", err)
	}
	wrappedKey, keyIV, keyTag, err := sealBytes(dataKey, masterKey)
	if err != nil {
		return Envelope{}, err
	}
	ciphertext, payloadIV, payloadTag, err := sealBytes(plaintext, dataKey)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{
		Version:          1,
		EncryptedDataKey: wrappedKey,
		DataKeyIV:        keyIV,
		DataKeyTag:       keyTag,
		Ciphertext:       ciphertext,
		PayloadIV:        payloadIV,
		PayloadTag:       payloadTag,
	}, nil
}

func Open(envelope Envelope, encodedMasterKey string) (map[string]any, error) {
	if envelope.Version != 1 {
		return nil, errors.New("unsupported credential envelope version")
	}

	masterKey, err := base64.StdEncoding.DecodeString(encodedMasterKey)
	if err != nil || len(masterKey) != 32 {
		return nil, errors.New("master key must be base64-encoded 32 bytes")
	}
	dataKey, err := openBytes(
		envelope.EncryptedDataKey,
		envelope.DataKeyIV,
		envelope.DataKeyTag,
		masterKey,
	)
	if err != nil {
		return nil, errors.New("could not unwrap data key")
	}
	plaintext, err := openBytes(
		envelope.Ciphertext,
		envelope.PayloadIV,
		envelope.PayloadTag,
		dataKey,
	)
	if err != nil {
		return nil, errors.New("could not decrypt credential payload")
	}

	var payload map[string]any
	if err := json.Unmarshal(plaintext, &payload); err != nil {
		return nil, errors.New("credential payload is not valid JSON")
	}
	return payload, nil
}

func sealBytes(plaintext, key []byte) (ciphertext, iv, tag string, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", "", err
	}
	sealed := gcm.Seal(nil, nonce, plaintext, nil)
	tagOffset := len(sealed) - gcm.Overhead()
	return base64.StdEncoding.EncodeToString(sealed[:tagOffset]),
		base64.StdEncoding.EncodeToString(nonce),
		base64.StdEncoding.EncodeToString(sealed[tagOffset:]),
		nil
}

func openBytes(
	encodedCiphertext string,
	encodedIV string,
	encodedTag string,
	key []byte,
) ([]byte, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(encodedCiphertext)
	if err != nil {
		return nil, err
	}
	iv, err := base64.StdEncoding.DecodeString(encodedIV)
	if err != nil {
		return nil, err
	}
	tag, err := base64.StdEncoding.DecodeString(encodedTag)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, iv, append(ciphertext, tag...), nil)
}
