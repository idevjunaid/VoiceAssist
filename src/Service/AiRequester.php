<?php

namespace Drupal\voice_assist\Service;

use Drupal\ai\AiProviderPluginManager;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\ai\OperationType\Chat\ChatInput;
use Drupal\ai\OperationType\Chat\ChatMessage;
use Drupal\ai\OperationType\TextToSpeech\TextToSpeechInput;
use Drupal\ai\OperationType\TextToSpeech\TextToSpeechOutput;

class AiRequester
{

    protected AiProviderPluginManager $providerManager;
    protected ConfigFactoryInterface $configFactory;

    public function __construct(
        AiProviderPluginManager $providerManager,
        ConfigFactoryInterface $configFactory
    ) {
        $this->providerManager = $providerManager;
        $this->configFactory = $configFactory;
    }

    public function ask(string $prompt): string
    {
        $provider_info = $this->providerManager->getDefaultProviderForOperationType('chat');

        if (empty($provider_info)) {
            return 'No chat provider configured.';
        }

        $provider = $this->providerManager->createInstance($provider_info['provider_id']);

        $messages = new ChatInput([
            new ChatMessage('user', $prompt),
        ]);

        try {
            $result = $provider->chat($messages, $provider_info['model_id'] ?? NULL);
            return $result->getNormalized()->getText();
        } catch (\Throwable $e) {
            return 'AI Error: ' . $e->getMessage();
        }
    }

    public function speak(string $text): ?string
    {
        $provider_info = $this->providerManager->getDefaultProviderForOperationType('text_to_speech');
        if (empty($provider_info)) {
            return NULL;
        }

        $provider = $this->providerManager->createInstance($provider_info['provider_id']);
        $model_id = $provider_info['model_id'] ?? NULL;
        $input = new TextToSpeechInput($text);

        try {
            /** @var \Drupal\ai\OperationType\TextToSpeech\TextToSpeechOutput $audios */
            $audios = $provider->textToSpeech($input, $model_id, []);

            /** @var \Drupal\ai\OperationType\GenericType\AudioFile $audioFile */
            $audioFile = $audios->getNormalized()[0];
            return $audioFile->getAsBinary();
        } catch (\Throwable $e) {
            \Drupal::logger('voice_assist')->error('TTS error: @msg', ['@msg' => $e->getMessage()]);
        }

        return NULL;
    }
}
