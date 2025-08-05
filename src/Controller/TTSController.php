<?php

namespace Drupal\voice_assist\Controller;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Drupal\Core\Controller\ControllerBase;
use Drupal\voice_assist\Service\AiRequester;
use Symfony\Component\HttpFoundation\JsonResponse;


class TTSController extends ControllerBase
{

  protected AiRequester $aiRequester;

  public function __construct(AiRequester $aiRequester)
  {
    $this->aiRequester = $aiRequester;
  }

  public static function create(ContainerInterface $container)
  {
    return new static(
      $container->get('voice_assist.ai_requester')
    );
  }

  public function speak(Request $request): Response
  {
    $text = json_decode($request->getContent(), true)['text'] ?? '';
    if (!$text) {
      return new Response('', 400);
    }

    $audio = $this->aiRequester->speak($text);
    if ($audio) {
      return new Response($audio, 200, ['Content-Type' => 'audio/mpeg']);
    }

    return new Response('', 204);
  }
}
