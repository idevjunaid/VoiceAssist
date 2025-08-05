<?php

namespace Drupal\voice_assist\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\voice_assist\Service\AiRequester;
use Symfony\Component\DependencyInjection\ContainerInterface;

class AIProxyController extends ControllerBase {

  protected AiRequester $aiRequester;

  public function __construct(AiRequester $aiRequester) {
    $this->aiRequester = $aiRequester;
  }

  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('voice_assist.ai_requester')
    );
  }

  public function process(Request $request): JsonResponse {
    $data = json_decode($request->getContent(), TRUE);

    $label = trim($data['label'] ?? '');
    $value = trim($data['value'] ?? '');
    $mode = trim($data['mode'] ?? 'question'); // question or interpret

    if (empty($label)) {
      return new JsonResponse(['error' => 'Label is required.'], 400);
    }

    if ($mode === 'question') {
      $prompt = "Convert the following form label into a natural-sounding human question: \"$label\"";
    }
    elseif ($mode === 'interpret' && !empty($value)) {
     $prompt = "Convert the user's spoken input \"$value\" into a concise and valid value suitable for the field labeled \"$label\". Only return the interpreted value without explanation.";
    }
    else {
      return new JsonResponse(['error' => 'Invalid or missing value for interpretation.'], 400);
    }

    $response = $this->aiRequester->ask($prompt);
    return new JsonResponse(['response' => $response]);
  }

}
