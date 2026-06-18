import 'package:flutter/material.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class AsyncPanel extends StatelessWidget {
  const AsyncPanel({
    required this.message,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: Theme.of(context).textTheme.bodyMedium),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            FilledButton(
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
